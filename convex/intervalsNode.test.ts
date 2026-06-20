import { ConvexError } from "convex/values"
import { describe, expect, test, vi } from "vitest"
import {
  buildActivitiesUrl,
  buildEventsUrl,
  buildIntervalsBasicAuthorization,
  fetchIntervalsJson,
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

  test("builds bounded activity and event requests with explicit fields", () => {
    const activities = new URL(
      buildActivitiesUrl("i 123", "2026-01-01", "2026-01-30"),
    )
    expect(activities.pathname).toBe("/api/v1/athlete/i%20123/activities")
    expect(activities.searchParams.get("oldest")).toBe("2026-01-01")
    expect(activities.searchParams.get("newest")).toBe("2026-01-30")
    expect(activities.searchParams.get("fields")?.split(",")).toEqual(
      expect.arrayContaining([
        "id",
        "start_date",
        "icu_distance",
        "carbs_ingested",
        "paired_event_id",
      ]),
    )

    const events = new URL(buildEventsUrl("i123", "2026-01-01", "2026-01-30"))
    expect(events.pathname).toBe("/api/v1/athlete/i123/events")
    expect(events.searchParams.get("category")).toBe(
      "WORKOUT,RACE_A,RACE_B,RACE_C",
    )
  })

  test("retries rate limits, server failures, and network errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "Retry-After": "1" } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )
    const sleep = vi.fn().mockResolvedValue(undefined)
    await expect(
      fetchIntervalsJson("https://example.test", "secret", fetcher, sleep),
    ).resolves.toEqual({ ok: true })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenNthCalledWith(1, 250)
    expect(sleep).toHaveBeenNthCalledWith(2, 1000)
  })

  test("does not retry authentication or malformed JSON", async () => {
    for (const response of [
      new Response(null, { status: 401 }),
      new Response("invalid", { status: 200 }),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response)
      await expect(
        fetchIntervalsJson("https://example.test", "secret", fetcher),
      ).rejects.toBeInstanceOf(ConvexError)
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  })

  test("stops after the initial request and three retries", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }))
    await expect(
      fetchIntervalsJson(
        "https://example.test",
        "secret",
        fetcher,
        vi.fn().mockResolvedValue(undefined),
      ),
    ).rejects.toBeInstanceOf(ConvexError)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
})
