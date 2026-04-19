/**
 * Utilidades para encriptación cliente-side (AES-GCM)
 */

const ALGO = 'AES-GCM';

// Generar o derivar una llave a partir de una contraseña
export async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt || enc.encode('algun-salt-fijo'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGO, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encriptar un ArrayBuffer
export async function encryptFile(arrayBuffer, password) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password);
  
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    arrayBuffer
  );

  // Devolvemos el IV + Contenido encriptado
  const result = new Uint8Array(iv.length + encryptedContent.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encryptedContent), iv.length);
  return result;
}

// Desencriptar un ArrayBuffer
export async function decryptFile(encryptedArrayBuffer, password) {
  const data = new Uint8Array(encryptedArrayBuffer);
  const iv = data.slice(0, 12);
  const content = data.slice(12);
  
  const key = await deriveKey(password);
  
  try {
    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: ALGO, iv },
      key,
      content
    );
    return decryptedContent;
  } catch (e) {
    throw new Error('Contraseña incorrecta o archivo dañado');
  }
}
