import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGO = "aes-256-gcm";
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error("TOKEN_ENCRYPTION_KEY env var is not set — refusing to handle tokens");
  }
  const buf = Buffer.from(keyHex, "hex");
  if (buf.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return buf;
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv(ALGO, key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([nonce, authTag, encrypted]).toString("base64");
}

export function decryptToken(encrypted: string): string {
  const key = getKey();
  const buf = Buffer.from(encrypted, "base64");
  const nonce = buf.subarray(0, NONCE_LENGTH);
  const authTag = buf.subarray(NONCE_LENGTH, NONCE_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(NONCE_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
