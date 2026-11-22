/**
 * Local authentication is NOT production-grade security. There is no server,
 * so there is no way to fully protect credentials from someone with direct
 * access to this browser's IndexedDB storage. What this DOES do:
 *  - Never stores the raw password string anywhere.
 *  - Uses a per-user random salt + PBKDF2 (via Web Crypto's SubtleCrypto),
 *    which is far better than storing an unsalted hash or plaintext.
 *
 * See README.md "Authentication & Security Limitations" for the full
 * explanation of what this protects against and what it does not.
 */

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes.buffer
}

function getWebCrypto() {
  const webCrypto = globalThis.crypto
  if (!webCrypto?.getRandomValues || !webCrypto.subtle) {
    throw new Error(
      'Secure password storage requires HTTPS. Open Habitline using an HTTPS address (or localhost on this device), then try again.'
    )
  }
  return webCrypto
}

export function generateSalt() {
  const salt = getWebCrypto().getRandomValues(new Uint8Array(16))
  return bufToHex(salt.buffer)
}

async function deriveKey(password, saltHex) {
  const enc = new TextEncoder()
  const subtle = getWebCrypto().subtle
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBuf(saltHex),
      iterations: 150000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  )
  return bufToHex(bits)
}

export async function hashPassword(password) {
  const salt = generateSalt()
  const hash = await deriveKey(password, salt)
  return { salt, hash }
}

export async function verifyPassword(password, salt, expectedHash) {
  const hash = await deriveKey(password, salt)
  return hash === expectedHash
}
