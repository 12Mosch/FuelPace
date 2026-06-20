import { describe, expect, test } from "vitest"
import {
  hasRequiredIntervalsScope,
  normalizeScopes,
  parseIntervalsTokenResponse,
} from "./intervals"

describe("Intervals token response", () => {
  test("parses athlete identity, token, and normalized scopes", () => {
    expect(
      parseIntervalsTokenResponse({
        access_token: "secret",
        token_type: "Bearer",
        scope: "activity:read, WELLNESS:READ",
        athlete: { id: "123", name: "Ada Rider" },
      }),
    ).toEqual({
      accessToken: "secret",
      athleteId: "123",
      athleteName: "Ada Rider",
      grantedScopes: ["ACTIVITY:READ", "WELLNESS:READ"],
    })
  })

  test.each([
    null,
    {},
    { access_token: "token", token_type: "Bearer", scope: "ACTIVITY:READ" },
    {
      access_token: "token",
      token_type: "Bearer",
      scope: "ACTIVITY:READ",
      athlete: {},
    },
    {
      access_token: "token",
      token_type: "Bearer",
      scope: "ACTIVITY:READ",
      athlete: { id: "1" },
    },
  ])("rejects malformed token response %#", (response) => {
    expect(() => parseIntervalsTokenResponse(response)).toThrow()
  })

  test("rejects an insufficient grant", () => {
    expect(() =>
      parseIntervalsTokenResponse({
        access_token: "secret",
        token_type: "Bearer",
        scope: "WELLNESS:READ",
        athlete: { id: "123", name: "Ada Rider" },
      }),
    ).toThrow(/required scope/)
  })

  test("rejects a non-bearer token type", () => {
    expect(() =>
      parseIntervalsTokenResponse({
        access_token: "secret",
        token_type: "Basic",
        scope: "ACTIVITY:READ",
        athlete: { id: "123", name: "Ada Rider" },
      }),
    ).toThrow(/bearer token/)
  })

  test("normalizes array and comma-delimited scope representations", () => {
    expect(normalizeScopes([" activity:read ", "ACTIVITY:READ"])).toEqual([
      "ACTIVITY:READ",
    ])
    expect(hasRequiredIntervalsScope(normalizeScopes("ACTIVITY:READ"))).toBe(
      true,
    )
    expect(hasRequiredIntervalsScope(normalizeScopes("WELLNESS:READ"))).toBe(
      false,
    )
  })
})
