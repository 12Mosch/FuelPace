import { ConvexError } from "convex/values"
import { describe, expect, test, vi } from "vitest"
import {
  buildIntervalsBasicAuthorization,
  validateIntervalsApiKey,
} from "./intervalsNode"

function errorCode(error: unknown) {
  return error instanceof ConvexError
    ? (error.data as { code?: string }).code
    : undefined
}

describe("Intervals API key validation", () => {
  test("constructs Basic auth with the literal API_KEY username", () => {
    const authorization = buildIntervalsBasicAuthorization("secret-key")
    expect(authorization.startsWith("Basic ")).toBe(true)
    expect(
      Buffer.from(authorization.slice("Basic ".length), "base64").toString(),
    ).toBe("API_KEY:secret-key")
  })

  test("validates an API key and requests athlete 0", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "i123", name: "Ada Rider" }), {
        status: 200,
      }),
    )
    await expect(
      validateIntervalsApiKey("top-secret", fetcher),
    ).resolves.toEqual({ athleteId: "i123", athleteName: "Ada Rider" })
    expect(fetcher).toHaveBeenCalledWith(
      "https://intervals.icu/api/v1/athlete/0",
      expect.objectContaining({
        headers: {
          Authorization: buildIntervalsBasicAuthorization("top-secret"),
        },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  test.each([401, 403])("maps HTTP %s to INVALID_API_KEY", async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status }))
    await expect(
      validateIntervalsApiKey("never-leak", fetcher),
    ).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === "INVALID_API_KEY",
    )
  })

  test.each([
    429, 500, 503,
  ])("maps HTTP %s to INTERVALS_UNAVAILABLE", async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status }))
    await expect(
      validateIntervalsApiKey("never-leak", fetcher),
    ).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === "INTERVALS_UNAVAILABLE",
    )
  })

  test("maps malformed JSON and athlete data to INVALID_RESPONSE", async () => {
    for (const response of [
      new Response("not json", { status: 200 }),
      new Response(JSON.stringify({ id: "i123" }), { status: 200 }),
    ]) {
      await expect(
        validateIntervalsApiKey(
          "never-leak",
          vi.fn<typeof fetch>().mockResolvedValue(response),
        ),
      ).rejects.toSatisfy(
        (error: unknown) => errorCode(error) === "INVALID_RESPONSE",
      )
    }
  })

  test("maps timeout and network failures without exposing the key", async () => {
    for (const failure of [
      new DOMException("timed out", "TimeoutError"),
      new TypeError("network failed"),
    ]) {
      try {
        await validateIntervalsApiKey(
          "never-leak",
          vi.fn<typeof fetch>().mockRejectedValue(failure),
        )
        throw new Error("Expected validation to fail")
      } catch (error) {
        expect(errorCode(error)).toBe("INTERVALS_UNAVAILABLE")
        expect(String(error)).not.toContain("never-leak")
      }
    }
  })
})
