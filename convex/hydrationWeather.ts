import { ConvexError, v } from "convex/values"
import { internal } from "./_generated/api"
import { action, internalAction } from "./_generated/server"
import {
  fetchOpenMeteoJson,
  parseGeocodingResponse,
  parseHourlyWeatherResponse,
  weatherForHour,
} from "./lib/openMeteo"

async function requireOwner(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> }
}) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Not authenticated")
  return identity.tokenIdentifier
}

async function fetchJson(url: URL): Promise<unknown> {
  try {
    return await fetchOpenMeteoJson(url)
  } catch (error) {
    throw new ConvexError({
      code:
        error instanceof Error && error.message === "INVALID_WEATHER_RESPONSE"
          ? "INVALID_WEATHER_RESPONSE"
          : "WEATHER_UNAVAILABLE",
    })
  }
}

export const searchLocations = action({
  args: { query: v.string() },
  returns: v.array(
    v.object({
      id: v.number(),
      displayName: v.string(),
      latitude: v.number(),
      longitude: v.number(),
      timezone: v.string(),
    }),
  ),
  handler: async (ctx, { query }) => {
    await requireOwner(ctx)
    const normalized = query.trim()
    if (normalized.length < 2 || normalized.length > 100) {
      throw new ConvexError({ code: "INVALID_LOCATION_QUERY" })
    }
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search")
    url.searchParams.set("name", normalized)
    url.searchParams.set("count", "8")
    url.searchParams.set("language", "en")
    url.searchParams.set("format", "json")
    try {
      return parseGeocodingResponse(await fetchJson(url))
    } catch (error) {
      if (error instanceof ConvexError) throw error
      throw new ConvexError({ code: "INVALID_WEATHER_RESPONSE" })
    }
  },
})

export const refreshWeather = action({
  args: {},
  returns: v.union(
    v.literal("no_location"),
    v.literal("fresh"),
    v.literal("refreshed"),
    v.literal("unavailable"),
  ),
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const context = await ctx.runQuery(
      internal.hydration.getWeatherRefreshContext,
      {
        ownerTokenIdentifier,
      },
    )
    if (!context.location) return "no_location"
    if (context.isFresh) return "fresh"
    const url = new URL("https://api.open-meteo.com/v1/forecast")
    url.searchParams.set("latitude", String(context.location.latitude))
    url.searchParams.set("longitude", String(context.location.longitude))
    url.searchParams.set(
      "hourly",
      "temperature_2m,relative_humidity_2m,apparent_temperature",
    )
    url.searchParams.set("timezone", context.location.timezone)
    url.searchParams.set("forecast_days", "7")
    try {
      const hours = parseHourlyWeatherResponse(await fetchJson(url))
      await ctx.runMutation(internal.hydration.upsertWeatherCache, {
        ownerTokenIdentifier,
        latitude: context.location.latitude,
        longitude: context.location.longitude,
        timezone: context.location.timezone,
        fetchedAt: Date.now(),
        hours,
      })
      return "refreshed"
    } catch {
      return "unavailable"
    }
  },
})

export const getHistoricalWeather = internalAction({
  args: {
    latitude: v.number(),
    longitude: v.number(),
    timezone: v.string(),
    localDateTime: v.string(),
  },
  returns: v.union(
    v.object({
      apparentTemperatureC: v.number(),
      temperatureC: v.number(),
      relativeHumidityPercent: v.number(),
    }),
    v.null(),
  ),
  handler: async (_ctx, args) => {
    const date = args.localDateTime.slice(0, 10)
    const url = new URL("https://archive-api.open-meteo.com/v1/archive")
    url.searchParams.set("latitude", String(args.latitude))
    url.searchParams.set("longitude", String(args.longitude))
    url.searchParams.set("start_date", date)
    url.searchParams.set("end_date", date)
    url.searchParams.set(
      "hourly",
      "temperature_2m,relative_humidity_2m,apparent_temperature",
    )
    url.searchParams.set("timezone", args.timezone)
    const hours = parseHourlyWeatherResponse(await fetchJson(url))
    return weatherForHour(hours, args.localDateTime) ?? null
  },
})
