/**
 * Servizio per la crittografia end-to-end delle chat
 * Utilizza Web Crypto API per crittografia asimmetrica (ECDH) e simmetrica (AES-GCM)
 */

// Tipi per le chiavi
interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

interface PublicKeyJWK {
  kty: string;
  crv: string;
  x: string;
  y: string;
}

interface EncryptedMessage {
  encryptedContent: string; // Base64
  iv: string; // Base64
  ephemeralPublicKey: string; // JWK JSON string
}

// Configurazione algoritmi
const ECDH_ALGORITHM = {
  name: 'ECDH',
  namedCurve: 'P-256'
};

const AES_GCM_ALGORITHM = {
  name: 'AES-GCM',
  length: 256
};

const AES_GCM_IV_LENGTH = 12; // 96 bit per AES-GCM

/**
 * Genera una coppia di chiavi ECDH per un utente
 */
export async function generateKeyPair(): Promise<KeyPair> {
  try {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: ECDH_ALGORITHM.name,
        namedCurve: ECDH_ALGORITHM.namedCurve
      },
      true, // extractable
      ['deriveKey', 'deriveBits']
    );

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey
    };
  } catch (error) {
    console.error('Errore generazione chiavi:', error);
    throw new Error('Impossibile generare le chiavi di crittografia');
  }
}

/**
 * Esporta una chiave pubblica in formato JWK
 */
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  try {
    const jwk = await crypto.subtle.exportKey('jwk', publicKey);
    return JSON.stringify(jwk);
  } catch (error) {
    console.error('Errore esportazione chiave pubblica:', error);
    throw new Error('Impossibile esportare la chiave pubblica');
  }
}

/**
 * Importa una chiave pubblica da formato JWK
 */
export async function importPublicKey(jwkString: string): Promise<CryptoKey> {
  try {
    const jwk = JSON.parse(jwkString) as PublicKeyJWK;
    return await crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: ECDH_ALGORITHM.name,
        namedCurve: ECDH_ALGORITHM.namedCurve
      },
      true,
      []
    );
  } catch (error) {
    console.error('Errore importazione chiave pubblica:', error);
    throw new Error('Impossibile importare la chiave pubblica');
  }
}

/**
 * Deriva una chiave condivisa usando ECDH
 */
export async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  try {
    return await crypto.subtle.deriveKey(
      {
        name: ECDH_ALGORITHM.name,
        public: publicKey
      },
      privateKey,
      {
        name: AES_GCM_ALGORITHM.name,
        length: AES_GCM_ALGORITHM.length
      },
      false, // non extractable
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    console.error('Errore derivazione chiave condivisa:', error);
    throw new Error('Impossibile derivare la chiave condivisa');
  }
}

/**
 * Genera una chiave ephemeral per ogni messaggio (forward secrecy)
 */
export async function generateEphemeralKeyPair(): Promise<KeyPair> {
  return generateKeyPair();
}

/**
 * Crittografa un messaggio usando AES-GCM
 */
export async function encryptMessage(
  message: string,
  sharedKey: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  try {
    // Genera IV casuale
    const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));

    // Converti il messaggio in ArrayBuffer
    const encoder = new TextEncoder();
    const messageBuffer = encoder.encode(message);

    // Crittografa
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: AES_GCM_ALGORITHM.name,
        iv: iv
      },
      sharedKey,
      messageBuffer
    );

    // Converti in Base64 per il trasporto
    const encrypted = arrayBufferToBase64(encryptedBuffer);
    const ivBase64 = arrayBufferToBase64(iv);

    return {
      encrypted,
      iv: ivBase64
    };
  } catch (error) {
    console.error('Errore crittografia messaggio:', error);
    throw new Error('Impossibile crittografare il messaggio');
  }
}

/**
 * Decrittografa un messaggio usando AES-GCM
 */
export async function decryptMessage(
  encrypted: string,
  iv: string,
  sharedKey: CryptoKey
): Promise<string> {
  try {
    // Converti da Base64
    const encryptedBuffer = base64ToArrayBuffer(encrypted);
    const ivBuffer = base64ToArrayBuffer(iv);

    // Decrittografa
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: AES_GCM_ALGORITHM.name,
        iv: ivBuffer
      },
      sharedKey,
      encryptedBuffer
    );

    // Converti in stringa
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('Errore decrittografia messaggio:', error);
    throw new Error('Impossibile decrittografare il messaggio');
  }
}

/**
 * Crittografa un messaggio end-to-end
 * Usa una chiave ephemeral per forward secrecy
 */
export async function encryptE2EMessage(
  message: string,
  recipientPublicKey: CryptoKey,
  senderPrivateKey: CryptoKey
): Promise<EncryptedMessage> {
  try {
    // Genera chiave ephemeral per questo messaggio
    const ephemeralKeyPair = await generateEphemeralKeyPair();

    // Deriva chiave condivisa usando la chiave ephemeral del mittente
    // e la chiave pubblica del destinatario
    const sharedKey = await deriveSharedKey(
      ephemeralKeyPair.privateKey,
      recipientPublicKey
    );

    // Crittografa il messaggio
    const { encrypted, iv } = await encryptMessage(message, sharedKey);

    // Esporta la chiave pubblica ephemeral
    const ephemeralPublicKey = await exportPublicKey(ephemeralKeyPair.publicKey);

    return {
      encryptedContent: encrypted,
      iv: iv,
      ephemeralPublicKey: ephemeralPublicKey
    };
  } catch (error) {
    console.error('Errore crittografia E2E:', error);
    throw new Error('Impossibile crittografare il messaggio end-to-end');
  }
}

/**
 * Cifra lo stesso messaggio per due destinatari: chi lo riceve e chi lo scrive.
 *
 * Serve perche' la chiave e' derivata dalla pubblica del destinatario: senza
 * una seconda copia, il mittente non potrebbe piu' rileggere cio' che ha
 * mandato appena chiude la pagina. Le due copie usano chiavi effimere
 * distinte e non sono collegabili fra loro.
 */
export async function encryptE2EMessageDoppia(
  message: string,
  recipientPublicKey: CryptoKey,
  senderPublicKey: CryptoKey,
  senderPrivateKey: CryptoKey
): Promise<{ perDestinatario: EncryptedMessage; perMittente: EncryptedMessage }> {
  const [perDestinatario, perMittente] = await Promise.all([
    encryptE2EMessage(message, recipientPublicKey, senderPrivateKey),
    encryptE2EMessage(message, senderPublicKey, senderPrivateKey),
  ])
  return { perDestinatario, perMittente }
}

/**
 * Decrittografa un messaggio end-to-end
 */
export async function decryptE2EMessage(
  encryptedMessage: EncryptedMessage,
  recipientPrivateKey: CryptoKey
): Promise<string> {
  try {
    // Importa la chiave pubblica ephemeral del mittente
    const ephemeralPublicKey = await importPublicKey(
      encryptedMessage.ephemeralPublicKey
    );

    // Deriva la chiave condivisa usando la chiave privata del destinatario
    // e la chiave pubblica ephemeral del mittente
    const sharedKey = await deriveSharedKey(
      recipientPrivateKey,
      ephemeralPublicKey
    );

    // Decrittografa il messaggio
    return await decryptMessage(
      encryptedMessage.encryptedContent,
      encryptedMessage.iv,
      sharedKey
    );
  } catch (error) {
    console.error('Errore decrittografia E2E:', error);
    throw new Error('Impossibile decrittografare il messaggio end-to-end');
  }
}

/**
 * Salva le chiavi private in localStorage (sicuro solo per demo)
 * In produzione, considera l'uso di IndexedDB o un sistema più sicuro
 */
export function savePrivateKey(userId: string, privateKey: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    crypto.subtle.exportKey('jwk', privateKey)
      .then(jwk => {
        try {
          localStorage.setItem(`e2e_private_key_${userId}`, JSON.stringify(jwk));
          resolve();
        } catch (error) {
          reject(new Error('Impossibile salvare la chiave privata'));
        }
      })
      .catch(reject);
  });
}

/**
 * Carica la chiave privata da localStorage
 */
export async function loadPrivateKey(userId: string): Promise<CryptoKey | null> {
  try {
    const jwkString = localStorage.getItem(`e2e_private_key_${userId}`);
    if (!jwkString) {
      return null;
    }

    const jwk = JSON.parse(jwkString);
    return await crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: ECDH_ALGORITHM.name,
        namedCurve: ECDH_ALGORITHM.namedCurve
      },
      true,
      ['deriveKey', 'deriveBits']
    );
  } catch (error) {
    console.error('Errore caricamento chiave privata:', error);
    return null;
  }
}

/**
 * La chiave pubblica che fa coppia con la privata salvata su questo
 * dispositivo, in JWK. La privata in JWK porta con se' anche le coordinate
 * pubbliche (x, y): basta toglierle `d`.
 */
export function chiavePubblicaLocale(userId: string): string | null {
  try {
    const jwkString = localStorage.getItem(`e2e_private_key_${userId}`);
    if (!jwkString) return null;
    const { kty, crv, x, y } = JSON.parse(jwkString);
    if (!x || !y) return null;
    return JSON.stringify({ kty, crv, x, y, ext: true, key_ops: [] });
  } catch {
    return null;
  }
}

/** Due chiavi pubbliche JWK sono la stessa chiave se coincidono le coordinate. */
export function stessaChiavePubblica(a: string, b: string): boolean {
  try {
    const ja = JSON.parse(a);
    const jb = JSON.parse(b);
    return ja.x === jb.x && ja.y === jb.y && ja.crv === jb.crv;
  } catch {
    return false;
  }
}

/**
 * Rimuove la chiave privata da localStorage
 */
export function removePrivateKey(userId: string): void {
  localStorage.removeItem(`e2e_private_key_${userId}`);
}

// Utility functions
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

