"use node"

import { ConvexError, v } from "convex/values"
import { internalAction } from "./_generated/server"
import { encryptCredential } from "./lib/credentialCrypto"
import {
  type IntervalsAthlete,
  parseIntervalsAthleteResponse,
} from "./lib/intervals"

const ATHLETE_ENDPOINT = "https://intervals.icu/api/v1/athlete/0"
const VALIDATION_TIMEOUT_MS = 10_000

type IntervalsErrorCode =
  | "INVALID_API_KEY"
  | "INTERVALS_UNAVAILABLE"
  | "INVALID_RESPONSE"

function intervalsError(
  code: IntervalsErrorCode,
): ConvexError<{ code: string }> {
  return new ConvexError({ code })
}

export function buildIntervalsBasicAuthorization(apiKey: string): string {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`, "utf8").toString("base64")}`
}

export async function validateIntervalsApiKey(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<IntervalsAthlete> {
  let response: Response
  try {
    response = await fetcher(ATHLETE_ENDPOINT, {
      headers: { Authorization: buildIntervalsBasicAuthorization(apiKey) },
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    })
  } catch {
    throw intervalsError("INTERVALS_UNAVAILABLE")
  }

  if (response.status === 401 || response.status === 403) {
    throw intervalsError("INVALID_API_KEY")
  }
  if (response.status === 429 || response.status >= 500 || !response.ok) {
    throw intervalsError("INTERVALS_UNAVAILABLE")
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw intervalsError("INVALID_RESPONSE")
  }

  try {
    return parseIntervalsAthleteResponse(body)
  } catch {
    throw intervalsError("INVALID_RESPONSE")
  }
}

export const validateAndEncrypt = internalAction({
  args: { apiKey: v.string() },
  handler: async (_ctx, { apiKey }) => {
    const athlete = await validateIntervalsApiKey(apiKey)
    const encrypted = encryptCredential(apiKey)
    return {
      ...athlete,
      encryptedApiKey: encrypted.ciphertext,
      encryptionIv: encrypted.encryptionIv,
      encryptionVersion: encrypted.encryptionVersion,
    }
  },
})
