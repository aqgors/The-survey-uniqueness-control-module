import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_HEX = process.env.MESSAGE_ENCRYPTION_KEY || '';

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('MESSAGE_ENCRYPTION_KEY must be set and be exactly 64 hex characters (32 bytes)');
  }
  return Buffer.from(KEY_HEX, 'hex');
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a string in the format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encryptMessage(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a string previously produced by encryptMessage.
 * Returns the original plaintext, or the raw value if it doesn't look encrypted
 * (for backwards compatibility with old plaintext messages).
 */
export function decryptMessage(stored: string): string {
  // Backwards-compat: if it doesn't match the expected format, return as-is
  const parts = stored.split(':');
  if (parts.length !== 3) return stored;

  try {
    const key = getKey();
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ciphertext = Buffer.from(parts[2], 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
  } catch {
    // If decryption fails (e.g. legacy plaintext), return raw
    return stored;
  }
}
