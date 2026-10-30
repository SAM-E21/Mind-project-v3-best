const encoder = new TextEncoder()

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function toBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

export function generateUnlockSecret() {
  return toBase64(randomBytes(32)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function deriveVaultKey(secret, salt) {
  if (!secret || secret.length < 16) throw new Error('La clave debe tener al menos 16 caracteres.')
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptBytes(input, key) {
  const iv = randomBytes(12)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, input))
  const result = new Uint8Array(iv.length + ciphertext.length)
  result.set(iv)
  result.set(ciphertext, iv.length)
  return result
}

export async function decryptBytes(input, key) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length < 29) throw new Error('Archivo cifrado inválido o incompleto.')
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
}

export function exportKeyFile(secret) {
  return new Blob([JSON.stringify({ format: 'csdk-v1', secret })], { type: 'application/vnd.csdk+json' })
}

export async function readKeyFile(file) {
  let content
  try {
    content = JSON.parse(await file.text())
  } catch {
    throw new Error('El archivo no tiene un formato .csdk válido.')
  }
  if (content.format !== 'csdk-v1' || typeof content.secret !== 'string' || content.secret.length < 16) {
    throw new Error('El archivo .csdk no contiene una clave reconocida.')
  }
  return content.secret
}

export async function readNfcSecret() {
  if (!('NDEFReader' in window)) throw new Error('Este navegador no admite NFC web. Prueba Chrome en Android con HTTPS.')
  const reader = new window.NDEFReader()
  const secret = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No se detectó una etiqueta NFC.')), 20000)
    reader.addEventListener('reading', event => {
      clearTimeout(timeout)
      const record = event.message.records.find(item => item.recordType === 'text')
      if (!record) return reject(new Error('La etiqueta NFC no contiene una clave compatible.'))
      resolve(new TextDecoder(record.encoding || 'utf-8').decode(record.data))
    }, { once: true })
    reader.addEventListener('readingerror', () => {
      clearTimeout(timeout)
      reject(new Error('No se pudo leer la etiqueta NFC.'))
    }, { once: true })
    reader.scan().catch(error => {
      clearTimeout(timeout)
      reject(error)
    })
  })
  return secret
}

export async function writeNfcSecret(secret) {
  if (!('NDEFReader' in window)) throw new Error('Este navegador no admite escritura NFC web. Prueba Chrome en Android con HTTPS.')
  const writer = new window.NDEFReader()
  await writer.write({ records: [{ recordType: 'text', data: secret }] })
}