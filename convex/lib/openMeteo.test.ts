import { describe, expect, test } from "vitest"
import {
  fetchOpenMeteoJson,
  parseGeocodingResponse,
  parseHourlyWeatherResponse,
  weatherForHour,
} from "./openMeteo"

describe("Open-Meteo parsing", () => {
  test("maps network timeouts and HTTP failures to availability errors", async () => {
    const timeout = async () => {
      throw new DOMException("Timed out", "AbortError")
    }
    await expect(
      fetchOpenMeteoJson(
        new URL("https://example.test"),
        timeout as typeof fetch,
        1,
      ),
    ).rejects.toThrow("WEATHER_UNAVAILABLE")
    await expect(
      fetchOpenMeteoJson(
        new URL("https://example.test"),
        async () => new Response(null, { status: 503 }),
      ),
    ).rejects.toThrow("WEATHER_UNAVAILABLE")
  })

  test("rejects malformed JSON responses", async () => {
    await expect(
      fetchOpenMeteoJson(
        new URL("https://example.test"),
        async () => new Response("not-json", { status: 200 }),
      ),
    ).rejects.toThrow("INVALID_WEATHER_RESPONSE")
  })

  test("normalizes bounded geocoding results", () => {
    expect(
      parseGeocodingResponse({
        results: [
          {
            id: 1,
            name: "Freiburg",
            admin1: "Baden-Württemberg",
            country: "Germany",
            latitude: 48,
            longitude: 7.85,
            timezone: "Europe/Berlin",
          },
        ],
      }),
    ).toEqual([
      {
        id: 1,
        displayName: "Freiburg, Baden-Württemberg, Germany",
        latitude: 48,
        longitude: 7.85,
        timezone: "Europe/Berlin",
      },
    ])
    expect(parseGeocodingResponse({})).toEqual([])
  })

  test("parses hourly forecast and historical response shapes", () => {
    const hours = parseHourlyWeatherResponse({
      hourly: {
        time: ["2026-06-20T08:00", "2026-06-20T09:00"],
        apparent_temperature: [18, 20],
        temperature_2m: [17, 19],
        relative_humidity_2m: [70, 65],
      },
    })
    expect(weatherForHour(hours, "2026-06-20T08:45:00")).toEqual({
      apparentTemperatureC: 18,
      temperatureC: 17,
      relativeHumidityPercent: 70,
    })
  })

  test.each([
    { hourly: {} },
    {
      hourly: {
        time: ["x"],
        apparent_temperature: [],
        temperature_2m: [],
        relative_humidity_2m: [],
      },
    },
    {
      results: [
        { id: "bad", name: "City", timezone: "UTC", latitude: 1, longitude: 2 },
      ],
    },
  ])("rejects malformed responses", (body) => {
    if ("results" in body) expect(() => parseGeocodingResponse(body)).toThrow()
    else expect(() => parseHourlyWeatherResponse(body)).toThrow()
  })
})
