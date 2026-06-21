import type { HydrationWeather } from "./hydration"

export type GeocodingResult = {
  id: number
  displayName: string
  latitude: number
  longitude: number
  timezone: string
}

export type WeatherHour = HydrationWeather & { localDateTime: string }

export async function fetchOpenMeteoJson(
  url: URL,
  fetcher: typeof fetch = fetch,
  timeoutMs = 6_000,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    throw new Error("WEATHER_UNAVAILABLE")
  }
  if (!response.ok) throw new Error("WEATHER_UNAVAILABLE")
  try {
    return await response.json()
  } catch {
    throw new Error("INVALID_WEATHER_RESPONSE")
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Open-Meteo response")
  }
  return value as Record<string, unknown>
}

function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Invalid Open-Meteo response")
  }
  return value
}

export function parseGeocodingResponse(value: unknown): GeocodingResult[] {
  const body = record(value)
  if (body.results === undefined) return []
  if (!Array.isArray(body.results))
    throw new Error("Invalid Open-Meteo response")
  return body.results.slice(0, 8).map((item) => {
    const result = record(item)
    if (
      typeof result.name !== "string" ||
      typeof result.timezone !== "string"
    ) {
      throw new Error("Invalid Open-Meteo response")
    }
    const parts = [result.name, result.admin1, result.country].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    )
    return {
      id: finite(result.id),
      displayName: [...new Set(parts)].join(", "),
      latitude: finite(result.latitude),
      longitude: finite(result.longitude),
      timezone: result.timezone,
    }
  })
}

export function parseHourlyWeatherResponse(value: unknown): WeatherHour[] {
  const hourly = record(record(value).hourly)
  const times = hourly.time
  const apparent = hourly.apparent_temperature
  const temperatures = hourly.temperature_2m
  const humidity = hourly.relative_humidity_2m
  if (
    !Array.isArray(times) ||
    !Array.isArray(apparent) ||
    !Array.isArray(temperatures) ||
    !Array.isArray(humidity) ||
    times.length !== apparent.length ||
    times.length !== temperatures.length ||
    times.length !== humidity.length
  ) {
    throw new Error("Invalid Open-Meteo response")
  }
  return times.slice(0, 168).map((time, index) => {
    if (typeof time !== "string") throw new Error("Invalid Open-Meteo response")
    return {
      localDateTime: time,
      apparentTemperatureC: finite(apparent[index]),
      temperatureC: finite(temperatures[index]),
      relativeHumidityPercent: finite(humidity[index]),
    }
  })
}

export function weatherForHour(
  hours: WeatherHour[],
  localDateTime: string,
): HydrationWeather | undefined {
  const key = localDateTime.slice(0, 13)
  const match = hours.find((hour) => hour.localDateTime.slice(0, 13) === key)
  if (!match) return undefined
  return {
    apparentTemperatureC: match.apparentTemperatureC,
    temperatureC: match.temperatureC,
    relativeHumidityPercent: match.relativeHumidityPercent,
  }
}
