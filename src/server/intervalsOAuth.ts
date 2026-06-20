import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export const INTERVALS_SCOPE = "ACTIVITY:READ"
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60
const COOKIE_PATH = "/api/integrations/intervals/callback"

export function requireIntervalsServerConfig() {
  const clientId = process.env.INTERVALS_CLIENT_ID
  const redirectUri = process.env.INTERVALS_REDIRECT_URI
  if (!clientId)
    throw new Error("Missing INTERVALS_CLIENT_ID environment variable")
  if (!redirectUri) {
    throw new Error("Missing INTERVALS_REDIRECT_URI environment variable")
  }
  return { clientId, redirectUri }
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url")
}

export function buildIntervalsAuthorizationUrl(input: {
  clientId: string
  redirectUri: string
  state: string
}) {
  const url = new URL("https://intervals.icu/oauth/authorize")
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: INTERVALS_SCOPE,
    state: input.state,
  }).toString()
  return url.toString()
}

export function oauthCookieName(isHttps: boolean) {
  return isHttps
    ? "__Host-fuelpace-intervals-state"
    : "fuelpace-intervals-state"
}

export function oauthCookieOptions(isHttps: boolean) {
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: isHttps ? "/" : COOKIE_PATH,
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  }
}

export function stateMatches(
  expected: string | undefined,
  actual: string | null,
) {
  if (!expected || !actual) return false
  const expectedHash = createHash("sha256").update(expected).digest()
  const actualHash = createHash("sha256").update(actual).digest()
  return timingSafeEqual(expectedHash, actualHash)
}
