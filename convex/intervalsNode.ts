"use node"

import { v } from "convex/values"
import { internalAction } from "./_generated/server"
import { encryptCredential } from "./lib/credentialCrypto"
import { parseIntervalsTokenResponse } from "./lib/intervals"

const TOKEN_ENDPOINT = "https://intervals.icu/api/oauth/token"
const EXCHANGE_TIMEOUT_MS = 10_000

export const exchangeAndEncrypt = internalAction({
  args: { code: v.string() },
  handler: async (_ctx, { code }) => {
    const clientId = process.env.INTERVALS_CLIENT_ID
    const clientSecret = process.env.INTERVALS_CLIENT_SECRET
    if (!clientId)
      throw new Error("Missing INTERVALS_CLIENT_ID environment variable")
    if (!clientSecret) {
      throw new Error("Missing INTERVALS_CLIENT_SECRET environment variable")
    }
    if (!process.env.INTEGRATIONS_ENCRYPTION_KEY) {
      throw new Error(
        "Missing INTEGRATIONS_ENCRYPTION_KEY environment variable",
      )
    }

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error("Intervals.icu token exchange failed")
    }

    const token = parseIntervalsTokenResponse(await response.json())
    return {
      athleteId: token.athleteId,
      athleteName: token.athleteName,
      grantedScopes: token.grantedScopes,
      ...encryptCredential(token.accessToken),
    }
  },
})
