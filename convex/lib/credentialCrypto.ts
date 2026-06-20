"use node"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

export const ENCRYPTION_VERSION = "aes-256-gcm-v1" as const

export type EncryptedCredential = {
  encryptedAccessToken: string
  encryptionIv: string
  encryptionVersion: typeof ENCRYPTION_VERSION
}

function readEncryptionKey(
  encodedKey = process.env.INTEGRATIONS_ENCRYPTION_KEY,
) {
  if (!encodedKey) {
    throw new Error("Missing INTEGRATIONS_ENCRYPTION_KEY environment variable")
  }
  const key = Buffer.from(encodedKey, "base64")
  if (key.length !== 32) {
    throw new Error(
      "INTEGRATIONS_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    )
  }
  return key
}

export function encryptCredential(
  accessToken: string,
  encodedKey?: string,
): EncryptedCredential {
  const iv = randomBytes(12)
  const cipher = createCipheriv(
    "aes-256-gcm",
    readEncryptionKey(encodedKey),
    iv,
  )
  const ciphertext = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ])
  const payload = Buffer.concat([ciphertext, cipher.getAuthTag()])
  return {
    encryptedAccessToken: payload.toString("base64"),
    encryptionIv: iv.toString("base64"),
    encryptionVersion: ENCRYPTION_VERSION,
  }
}

export function decryptCredential(
  credential: EncryptedCredential,
  encodedKey?: string,
): string {
  if (credential.encryptionVersion !== ENCRYPTION_VERSION) {
    throw new Error("Unsupported credential encryption version")
  }
  const payload = Buffer.from(credential.encryptedAccessToken, "base64")
  const iv = Buffer.from(credential.encryptionIv, "base64")
  if (iv.length !== 12 || payload.length <= 16) {
    throw new Error("Invalid encrypted credential")
  }
  const ciphertext = payload.subarray(0, -16)
  const authTag = payload.subarray(-16)
  const decipher = createDecipheriv(
    "aes-256-gcm",
    readEncryptionKey(encodedKey),
    iv,
  )
  decipher.setAuthTag(authTag)
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8")
}
