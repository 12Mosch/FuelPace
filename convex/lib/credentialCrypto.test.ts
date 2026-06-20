import { randomBytes } from "node:crypto"
import { describe, expect, test } from "vitest"
import { decryptCredential, encryptCredential } from "./credentialCrypto"

const key = randomBytes(32).toString("base64")

describe("Intervals credential encryption", () => {
  test("round trips with AES-256-GCM", () => {
    const encrypted = encryptCredential("bearer-token", key)
    expect(decryptCredential(encrypted, key)).toBe("bearer-token")
  })

  test("uses a fresh IV and ciphertext", () => {
    const first = encryptCredential("same-token", key)
    const second = encryptCredential("same-token", key)
    expect(first.encryptionIv).not.toBe(second.encryptionIv)
    expect(first.encryptedAccessToken).not.toBe(second.encryptedAccessToken)
  })

  test("rejects tampered ciphertext", () => {
    const encrypted = encryptCredential("bearer-token", key)
    const payload = Buffer.from(encrypted.encryptedAccessToken, "base64")
    payload[0] ^= 1
    expect(() =>
      decryptCredential(
        { ...encrypted, encryptedAccessToken: payload.toString("base64") },
        key,
      ),
    ).toThrow()
  })
})
