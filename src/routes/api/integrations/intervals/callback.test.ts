import { describe, expect, test } from "vitest"
import { parseIntervalsCallback, settingsRedirect } from "./callback"

describe("Intervals OAuth callback outcomes", () => {
  test("provider denial skips code processing", () => {
    const url = new URL(
      "https://fuelpace.test/api/integrations/intervals/callback?error=access_denied",
    )
    expect(parseIntervalsCallback(url, undefined)).toEqual({
      outcome: "denied",
    })
  })

  test.each([
    ["missing code", "?state=state", "state"],
    ["missing state", "?code=code", "state"],
    ["expired cookie", "?code=code&state=state", undefined],
    ["mismatched state", "?code=code&state=other", "state"],
  ])("rejects %s", (_name, search, cookie) => {
    const url = new URL(
      `https://fuelpace.test/api/integrations/intervals/callback${search}`,
    )
    expect(parseIntervalsCallback(url, cookie)).toEqual({ outcome: "error" })
  })

  test("accepts a valid code and matching state", () => {
    const url = new URL(
      "https://fuelpace.test/api/integrations/intervals/callback?code=code&state=state",
    )
    expect(parseIntervalsCallback(url, "state")).toEqual({ code: "code" })
  })

  test.each([
    "connected",
    "denied",
    "error",
  ] as const)("redirects %s to a fixed safe settings URL", (outcome) => {
    const response = settingsRedirect(
      new Request("https://fuelpace.test/api/integrations/intervals/callback"),
      outcome,
    )
    expect(response.headers.get("location")).toBe(
      `https://fuelpace.test/settings?intervals=${outcome}`,
    )
  })
})
