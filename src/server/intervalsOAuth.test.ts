import { describe, expect, test } from "vitest"
import {
  buildIntervalsAuthorizationUrl,
  INTERVALS_SCOPE,
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  oauthCookieName,
  oauthCookieOptions,
  stateMatches,
} from "./intervalsOAuth"

describe("Intervals OAuth server helpers", () => {
  test("builds the authorization URL with exact required parameters", () => {
    const redirectUri =
      "https://fuelpace.test/api/integrations/intervals/callback"
    const result = new URL(
      buildIntervalsAuthorizationUrl({
        clientId: "client-id",
        redirectUri,
        state: "random-state",
      }),
    )

    expect(result.origin + result.pathname).toBe(
      "https://intervals.icu/oauth/authorize",
    )
    expect(result.searchParams.get("client_id")).toBe("client-id")
    expect(result.searchParams.get("redirect_uri")).toBe(redirectUri)
    expect(result.searchParams.get("scope")).toBe(INTERVALS_SCOPE)
    expect(result.searchParams.get("state")).toBe("random-state")
  })

  test("uses a short-lived secure host cookie on HTTPS", () => {
    expect(oauthCookieName(true)).toMatch(/^__Host-/)
    expect(oauthCookieOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    })
    expect(OAUTH_COOKIE_MAX_AGE_SECONDS).toBeLessThanOrEqual(600)
  })

  test("uses a path-bound localhost-compatible cookie on HTTP", () => {
    expect(oauthCookieName(false)).not.toMatch(/^__Host-/)
    expect(oauthCookieOptions(false)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/api/integrations/intervals/callback",
    })
  })

  test.each([
    ["matching state", "expected", "expected", true],
    ["missing cookie", undefined, "expected", false],
    ["missing returned state", "expected", null, false],
    ["mismatched state", "expected", "different", false],
  ])("handles %s", (_name, expected, actual, matches) => {
    expect(stateMatches(expected, actual)).toBe(matches)
  })
})
