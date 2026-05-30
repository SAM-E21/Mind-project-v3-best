/**
 * Utilidades para encriptación cliente-side (AES-GCM)
 * Optimizadas con Web Worker en hilo secundario + caché de clave PBKDF2
 */

// Código del Web Worker embebido como string para evitar problemas con bundlers
const workerCode = `
  const ALGO = 'AES-GCM';
  // Caché en memoria del Worker: la derivación PBKDF2 se hace UNA SOLA VEZ
  const keyCache = new Map();

  async function deriveKey(password) {
    const enc = new TextEncoder();
    const keyMaterial = await self.crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return self.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode('algun-salt-fijo'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: ALGO, length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function getCachedKey(password) {
    if (keyCache.has(password)) {
      return keyCache.get(password);
    }
    const key = await deriveKey(password);
    keyCache.set(password, key);
    return key;
  }

  self.onmessage = async function(e) {
    const { type, arrayBuffer, password, id } = e.data;
    try {
      if (type === 'warmKey') {
        // Pre-calienta la clave ANTES de que carguen los archivos
        await getCachedKey(password);
        self.postMessage({ id, status: 'warmed' });
        return;
      }

      if (type === 'encrypt') {
        const iv = self.crypto.getRandomValues(new Uint8Array(12));
        const key = await getCachedKey(password);
        const encryptedContent = await self.crypto.subtle.encrypt(
          { name: ALGO, iv },
          key,
          arrayBuffer
        );
        const result = new Uint8Array(iv.length + encryptedContent.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(encryptedContent), iv.length);
        self.postMessage({ id, status: 'success', result: result.buffer }, [result.buffer]);

      } else if (type === 'decrypt') {
        const data = new Uint8Array(arrayBuffer);
        const iv = data.slice(0, 12);
        const content = data.slice(12);
        const key = await getCachedKey(password);
        const decryptedContent = await self.crypto.subtle.decrypt(
          { name: ALGO, iv },
          key,
          content
        );
        self.postMessage({ id, status: 'success', result: decryptedContent }, [decryptedContent]);
      }
    } catch (err) {
      self.postMessage({ id, status: 'error', error: err.message });
    }
  };
`;

// Crear el Worker como Blob para compatibilidad total con Vite
const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(workerBlob);

const pendingCallbacks = new Map();
let messageId = 0;
let workerInstance = null;

function getWorker() {
  if (!workerInstance) {
    workerInstance = new Worker(workerUrl);
    workerInstance.onmessage = (e) => {
      const { id, status, result, error } = e.data;
      const cb = pendingCallbacks.get(id);
      if (cb) {
        pendingCallbacks.delete(id);
        if (status === 'success' || status === 'warmed') {
          cb.resolve(result);
        } else {
          cb.reject(new Error(error || 'Error desconocido en Worker'));
        }
      }
    };
    workerInstance.onerror = (e) => {
      console.error('❌ Error crítico en Web Worker:', e);
    };
  }
  return workerInstance;
}

/**
 * PRE-CALIENTA la clave derivada PBKDF2 en el Worker justo cuando el usuario
 * introduce su contraseña. Así el primer descifrado de foto/video es instantáneo.
 * Llamar esto nada más se conozca la clave maestra.
 */
export function warmKey(password) {
  return new Promise((resolve) => {
    const id = messageId++;
    pendingCallbacks.set(id, { resolve, reject: resolve }); // no falla, solo avisa
    getWorker().postMessage({ type: 'warmKey', password, id });
  });
}

/**
 * Encripta un ArrayBuffer en el hilo del Worker (no bloquea la UI).
 */
export function encryptFile(arrayBuffer, password) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    pendingCallbacks.set(id, {
      resolve: (buf) => resolve(new Uint8Array(buf)),
      reject
    });
    // Copiamos para no neutar el buffer original
    const src = arrayBuffer.buffer ?? arrayBuffer;
    const copy = src.slice(0);
    getWorker().postMessage({ type: 'encrypt', arrayBuffer: copy, password, id }, [copy]);
  });
}

/**
 * Desencripta un ArrayBuffer en el hilo del Worker (no bloquea la UI).
 */
export function decryptFile(encryptedArrayBuffer, password) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    pendingCallbacks.set(id, {
      resolve,
      reject: () => reject(new Error('Contraseña incorrecta o archivo dañado'))
    });
    // Copiamos el buffer antes de transferir para no romper el ArrayBuffer original
    const src = encryptedArrayBuffer.buffer ?? encryptedArrayBuffer;
    const copy = src.slice(0);
    getWorker().postMessage({ type: 'decrypt', arrayBuffer: copy, password, id }, [copy]);
  });
}

/**
 * Hash SHA-256 de la contraseña para comparar la Clave de Coacción (Señuelo)
 * sin guardar la contraseña real en ningún lugar.
 */
export async function hashPassword(password) {
  const enc = new TextEncoder();
  const data = enc.encode(password + '-vault-decoy-salt');
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
