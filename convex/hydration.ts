import { ConvexError, v } from "convex/values"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server"
import {
  buildDailyHydrationPlan,
  calculateSweatRateEstimate,
  deriveIntensityMetric,
  type HydrationWorkout,
  type SweatTest,
} from "./lib/hydration"
import { weatherForHour } from "./lib/openMeteo"

const WEATHER_FRESH_MS = 30 * 60 * 1000
const WEATHER_STALE_MS = 6 * 60 * 60 * 1000
const SWEAT_TEST_LIMIT = 100
const ACTIVITY_LIMIT = 50
const WORKOUT_LIMIT = 20
const locationValidator = v.object({
  displayName: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  timezone: v.string(),
})
const weatherValidator = v.object({
  apparentTemperatureC: v.number(),
  temperatureC: v.number(),
  relativeHumidityPercent: v.number(),
})
const intensityMetricValidator = v.object({
  kind: v.union(
    v.literal("threshold_percent"),
    v.literal("power_watts"),
    v.literal("pace_seconds_per_kilometre"),
    v.literal("heart_rate_bpm"),
  ),
  value: v.number(),
})
const weatherHourValidator = v.object({
  localDateTime: v.string(),
  apparentTemperatureC: v.number(),
  temperatureC: v.number(),
  relativeHumidityPercent: v.number(),
})
const workoutHydrationEstimateValidator = v.object({
  workoutId: v.string(),
  name: v.optional(v.string()),
  durationHours: v.number(),
  lowDurationHours: v.number(),
  highDurationHours: v.number(),
  durationSource: v.union(
    v.literal("planned"),
    v.literal("estimated_range"),
    v.literal("sport_default"),
  ),
  sweatRateLitresPerHour: v.number(),
  lowRateLitresPerHour: v.number(),
  highRateLitresPerHour: v.number(),
  estimatedSweatLossLitres: v.number(),
  lowEstimatedSweatLossLitres: v.number(),
  highEstimatedSweatLossLitres: v.number(),
  recommendedDrinkRateLitresPerHour: v.number(),
  lowRecommendedDrinkRateLitresPerHour: v.number(),
  highRecommendedDrinkRateLitresPerHour: v.number(),
  recommendedDrinkLitres: v.number(),
  replacementLitres: v.number(),
  lowReplacementLitres: v.number(),
  highReplacementLitres: v.number(),
  sweatRateConfidence: v.union(
    v.literal("high"),
    v.literal("medium"),
    v.literal("low"),
  ),
  source: v.union(v.literal("personal"), v.literal("population")),
  matchedTests: v.number(),
  weatherAdjustmentFactor: v.number(),
  weatherAvailability: v.union(
    v.literal("not_applicable"),
    v.literal("available"),
    v.literal("missing"),
  ),
  isHighSweatRate: v.boolean(),
  sodiumMilligramsPerLitreLow: v.optional(v.number()),
  sodiumMilligramsPerLitreHigh: v.optional(v.number()),
  guidance: v.string(),
  weather: v.optional(weatherValidator),
  notes: v.array(v.string()),
})
const dailyHydrationPlanValidator = v.object({
  targetType: v.literal("total_beverages"),
  baselineLitres: v.number(),
  replacementFraction: v.number(),
  maxDrinkRateLitresPerHour: v.number(),
  workoutReplacementLitres: v.number(),
  additionalAboveBaselineLitres: v.number(),
  targetLitres: v.number(),
  lowLitres: v.number(),
  highLitres: v.number(),
  displayTargetLitres: v.number(),
  displayLowLitres: v.number(),
  displayHighLitres: v.number(),
  baselineConfidence: v.literal("high"),
  sweatRateConfidence: v.union(
    v.literal("not_applicable"),
    v.literal("high"),
    v.literal("medium"),
    v.literal("low"),
  ),
  weatherAvailability: v.union(
    v.literal("not_applicable"),
    v.literal("available"),
    v.literal("partial"),
    v.literal("missing"),
  ),
  workouts: v.array(workoutHydrationEstimateValidator),
  missingData: v.array(v.string()),
  weatherStatus: v.union(
    v.literal("fresh"),
    v.literal("stale"),
    v.literal("missing"),
  ),
  locationName: v.optional(v.string()),
  disclaimer: v.string(),
})

async function requireOwner(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> }
}) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Not authenticated")
  return identity.tokenIdentifier
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0)
    return true
  } catch {
    return false
  }
}

function validateLocation(location: {
  displayName: string
  latitude: number
  longitude: number
  timezone: string
}) {
  if (
    location.displayName.trim().length < 2 ||
    location.displayName.length > 200 ||
    !Number.isFinite(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90 ||
    !Number.isFinite(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180 ||
    !validTimezone(location.timezone)
  ) {
    throw new ConvexError({ code: "INVALID_LOCATION" })
  }
}

function localDateForInstant(instant: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

function localHourForInstant(instant: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:00`
}

async function currentSnapshot(ctx: QueryCtx, ownerTokenIdentifier: string) {
  const state = await ctx.db
    .query("intervalsSyncStates")
    .withIndex("by_ownerTokenIdentifier", (q) =>
      q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
    )
    .unique()
  if (!state?.activeImportRunId) return null
  const run = await ctx.db.get("intervalsImportRuns", state.activeImportRunId)
  if (
    run?.status !== "completed" ||
    run.ownerTokenIdentifier !== ownerTokenIdentifier
  ) {
    return null
  }
  const profile = await ctx.db
    .query("intervalsProfiles")
    .withIndex("by_importRunId", (q) => q.eq("importRunId", run._id))
    .unique()
  return profile ? { run, profile } : null
}

export const getSettings = query({
  args: {},
  returns: v.union(locationValidator, v.null()),
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const settings = await ctx.db
      .query("hydrationSettings")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()
    return settings
      ? {
          displayName: settings.displayName,
          latitude: settings.latitude,
          longitude: settings.longitude,
          timezone: settings.timezone,
        }
      : null
  },
})

export const saveLocation = mutation({
  args: locationValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    validateLocation(args)
    const existing = await ctx.db
      .query("hydrationSettings")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()
    const value = {
      ownerTokenIdentifier,
      displayName: args.displayName.trim(),
      latitude: args.latitude,
      longitude: args.longitude,
      timezone: args.timezone,
      updatedAt: Date.now(),
    }
    if (existing) await ctx.db.replace("hydrationSettings", existing._id, value)
    else await ctx.db.insert("hydrationSettings", value)
    return null
  },
})

export const clearLocation = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const [settings, cache] = await Promise.all([
      ctx.db
        .query("hydrationSettings")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
        )
        .unique(),
      ctx.db
        .query("hydrationWeatherCaches")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
        )
        .unique(),
    ])
    if (settings) await ctx.db.delete("hydrationSettings", settings._id)
    if (cache) await ctx.db.delete("hydrationWeatherCaches", cache._id)
    return null
  },
})

export const listCalibrationActivities = query({
  args: {},
  returns: v.array(
    v.object({
      sourceActivityId: v.string(),
      name: v.optional(v.string()),
      localStartDateTime: v.string(),
      startAt: v.number(),
      sport: v.string(),
      durationSeconds: v.number(),
      isIndoor: v.boolean(),
      intensity: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const snapshot = await currentSnapshot(ctx, ownerTokenIdentifier)
    if (!snapshot) return []
    const activities = await ctx.db
      .query("intervalsActivities")
      .withIndex("by_importRunId_and_startAt", (q) =>
        q.eq("importRunId", snapshot.run._id),
      )
      .order("desc")
      .take(ACTIVITY_LIMIT)
    return activities.flatMap((activity) => {
      const durationSeconds =
        activity.elapsedTimeSeconds ?? activity.movingTimeSeconds
      if (!durationSeconds || durationSeconds <= 0) return []
      return [
        {
          sourceActivityId: activity.sourceActivityId,
          name: activity.name,
          localStartDateTime: activity.localStartDateTime,
          startAt: activity.startAt,
          sport: activity.sport,
          durationSeconds,
          isIndoor: activity.isIndoor === true,
          intensity: activity.intensity,
        },
      ]
    })
  },
})

export const listSweatTests = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("hydrationSweatTests"),
      sourceActivityId: v.string(),
      activityName: v.optional(v.string()),
      activityStartAt: v.number(),
      preWeightKg: v.number(),
      postWeightKg: v.number(),
      consumedLitres: v.number(),
      urineLitres: v.optional(v.number()),
      scalePrecisionKg: v.optional(v.number()),
      volumePrecisionLitres: v.optional(v.number()),
      wetClothingAdjustmentKg: v.optional(v.number()),
      wetClothingUncertaintyKg: v.optional(v.number()),
      durationSeconds: v.number(),
      sport: v.string(),
      isIndoor: v.boolean(),
      intensity: v.optional(v.number()),
      intensityMetric: v.optional(intensityMetricValidator),
      sweatRateLitresPerHour: v.number(),
      lowSweatRateLitresPerHour: v.optional(v.number()),
      highSweatRateLitresPerHour: v.optional(v.number()),
      correctedBodyMassChangePercent: v.optional(v.number()),
      weather: v.optional(weatherValidator),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const tests = await ctx.db
      .query("hydrationSweatTests")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .order("desc")
      .take(SWEAT_TEST_LIMIT)
    return tests.map(
      ({
        _id,
        _creationTime: _ignored,
        ownerTokenIdentifier: _owner,
        ...test
      }) => ({
        id: _id,
        ...test,
      }),
    )
  },
})

export const deleteSweatTest = mutation({
  args: { id: v.id("hydrationSweatTests") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const test = await ctx.db.get("hydrationSweatTests", id)
    if (!test || test.ownerTokenIdentifier !== ownerTokenIdentifier) {
      throw new ConvexError({ code: "NOT_FOUND" })
    }
    await ctx.db.delete("hydrationSweatTests", id)
    return null
  },
})

export const getSweatTestContext = internalQuery({
  args: { ownerTokenIdentifier: v.string(), sourceActivityId: v.string() },
  returns: v.union(
    v.object({
      activity: v.object({
        sourceActivityId: v.string(),
        name: v.optional(v.string()),
        startAt: v.number(),
        localStartDateTime: v.string(),
        sport: v.string(),
        isIndoor: v.boolean(),
        intensity: v.optional(v.number()),
        distanceMetres: v.optional(v.number()),
        workJoules: v.optional(v.number()),
        averageHeartRate: v.optional(v.number()),
        averagePowerWatts: v.optional(v.number()),
        weightedAveragePowerWatts: v.optional(v.number()),
      }),
      location: v.union(locationValidator, v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const snapshot = await currentSnapshot(ctx, args.ownerTokenIdentifier)
    if (!snapshot) return null
    const activity = await ctx.db
      .query("intervalsActivities")
      .withIndex("by_importRunId_and_sourceActivityId", (q) =>
        q
          .eq("importRunId", snapshot.run._id)
          .eq("sourceActivityId", args.sourceActivityId),
      )
      .unique()
    if (!activity) return null
    const location = await ctx.db
      .query("hydrationSettings")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier),
      )
      .unique()
    return {
      activity: {
        sourceActivityId: activity.sourceActivityId,
        name: activity.name,
        startAt: activity.startAt,
        localStartDateTime: activity.localStartDateTime,
        sport: activity.sport,
        isIndoor: activity.isIndoor === true,
        intensity: activity.intensity,
        distanceMetres: activity.distanceMetres,
        workJoules: activity.workJoules,
        averageHeartRate: activity.averageHeartRate,
        averagePowerWatts: activity.averagePowerWatts,
        weightedAveragePowerWatts: activity.weightedAveragePowerWatts,
      },
      location: location
        ? {
            displayName: location.displayName,
            latitude: location.latitude,
            longitude: location.longitude,
            timezone: location.timezone,
          }
        : null,
    }
  },
})

export const insertSweatTest = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    sourceActivityId: v.string(),
    activityName: v.optional(v.string()),
    activityStartAt: v.number(),
    preWeightKg: v.number(),
    postWeightKg: v.number(),
    consumedLitres: v.number(),
    urineLitres: v.optional(v.number()),
    scalePrecisionKg: v.optional(v.number()),
    volumePrecisionLitres: v.optional(v.number()),
    wetClothingAdjustmentKg: v.optional(v.number()),
    wetClothingUncertaintyKg: v.optional(v.number()),
    durationSeconds: v.number(),
    sport: v.string(),
    isIndoor: v.boolean(),
    intensity: v.optional(v.number()),
    intensityMetric: v.optional(intensityMetricValidator),
    weather: v.optional(weatherValidator),
  },
  returns: v.id("hydrationSweatTests"),
  handler: async (ctx, args) => {
    const estimate = calculateSweatRateEstimate(args)
    if (
      estimate === null ||
      (args.intensityMetric !== undefined &&
        (!Number.isFinite(args.intensityMetric.value) ||
          args.intensityMetric.value <= 0))
    ) {
      throw new ConvexError({ code: "INVALID_SWEAT_TEST" })
    }
    const duplicate = await ctx.db
      .query("hydrationSweatTests")
      .withIndex("by_ownerTokenIdentifier_and_sourceActivityId", (q) =>
        q
          .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
          .eq("sourceActivityId", args.sourceActivityId),
      )
      .unique()
    if (duplicate) throw new ConvexError({ code: "DUPLICATE_ACTIVITY" })
    return await ctx.db.insert("hydrationSweatTests", {
      ...args,
      sweatRateLitresPerHour: estimate.rateLitresPerHour,
      lowSweatRateLitresPerHour: estimate.lowRateLitresPerHour,
      highSweatRateLitresPerHour: estimate.highRateLitresPerHour,
      correctedBodyMassChangePercent: estimate.correctedBodyMassChangePercent,
      createdAt: Date.now(),
    })
  },
})

export const getWeatherRefreshContext = internalQuery({
  args: { ownerTokenIdentifier: v.string() },
  returns: v.object({
    location: v.union(locationValidator, v.null()),
    isFresh: v.boolean(),
  }),
  handler: async (ctx, { ownerTokenIdentifier }) => {
    const [location, cache] = await Promise.all([
      ctx.db
        .query("hydrationSettings")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
        )
        .unique(),
      ctx.db
        .query("hydrationWeatherCaches")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
        )
        .unique(),
    ])
    return {
      location: location
        ? {
            displayName: location.displayName,
            latitude: location.latitude,
            longitude: location.longitude,
            timezone: location.timezone,
          }
        : null,
      isFresh: Boolean(
        cache &&
          location &&
          cache.latitude === location.latitude &&
          cache.longitude === location.longitude &&
          cache.timezone === location.timezone &&
          Date.now() - cache.fetchedAt < WEATHER_FRESH_MS,
      ),
    }
  },
})

export const upsertWeatherCache = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    timezone: v.string(),
    fetchedAt: v.number(),
    hours: v.array(weatherHourValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("hydrationWeatherCaches")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier),
      )
      .unique()
    if (existing)
      await ctx.db.replace("hydrationWeatherCaches", existing._id, args)
    else await ctx.db.insert("hydrationWeatherCaches", args)
    return null
  },
})

export const getDailyPlan = query({
  args: {},
  returns: dailyHydrationPlanValidator,
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const snapshot = await currentSnapshot(ctx, ownerTokenIdentifier)
    const [settings, cache, sweatRows] = await Promise.all([
      ctx.db
        .query("hydrationSettings")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
        )
        .unique(),
      ctx.db
        .query("hydrationWeatherCaches")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
        )
        .unique(),
      ctx.db
        .query("hydrationSweatTests")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
        )
        .order("desc")
        .take(SWEAT_TEST_LIMIT),
    ])
    const now = Date.now()
    const cacheUsable = Boolean(
      settings &&
        cache &&
        cache.latitude === settings.latitude &&
        cache.longitude === settings.longitude &&
        cache.timezone === settings.timezone &&
        now - cache.fetchedAt <= WEATHER_STALE_MS,
    )
    const weatherStatus: "missing" | "fresh" | "stale" = !cacheUsable
      ? "missing"
      : now - (cache?.fetchedAt ?? 0) <= WEATHER_FRESH_MS
        ? "fresh"
        : "stale"
    let plannedRows: Doc<"intervalsPlannedWorkouts">[] = []
    if (snapshot) {
      const today = localDateForInstant(now, snapshot.profile.timezone)
      plannedRows = await ctx.db
        .query("intervalsPlannedWorkouts")
        .withIndex("by_importRunId_and_localStartDate", (q) =>
          q.eq("importRunId", snapshot.run._id).eq("localStartDate", today),
        )
        .take(WORKOUT_LIMIT)
    }
    const workouts: HydrationWorkout[] = plannedRows.map((row) => {
      const usedFallbackStartTime = row.localStartDateTime === undefined
      const weatherTime =
        row.localStartDateTime ??
        localHourForInstant(
          now,
          settings?.timezone ?? snapshot?.profile.timezone ?? "UTC",
        )
      return {
        id: row.sourceEventId,
        name: row.name,
        sport: row.sport,
        durationSeconds: row.durationSeconds,
        isIndoor: row.isIndoor,
        intensity: row.intensity,
        intensityMetric: deriveIntensityMetric({
          sport: row.sport,
          intensity: row.intensity,
          durationSeconds: row.durationSeconds,
          distanceMetres: row.distanceMetres,
          workJoules: row.workJoules,
        }),
        usedFallbackStartTime,
        weather:
          row.isIndoor === true || !cacheUsable || !cache
            ? undefined
            : weatherForHour(cache.hours, weatherTime),
      }
    })
    const sweatTests: SweatTest[] = sweatRows.map((row) => ({
      sweatRateLitresPerHour: row.sweatRateLitresPerHour,
      lowSweatRateLitresPerHour: row.lowSweatRateLitresPerHour,
      highSweatRateLitresPerHour: row.highSweatRateLitresPerHour,
      sport: row.sport,
      isIndoor: row.isIndoor,
      activityStartAt: row.activityStartAt,
      durationSeconds: row.durationSeconds,
      intensity: row.intensity,
      intensityMetric: row.intensityMetric,
      weather: row.weather,
    }))
    const plan = buildDailyHydrationPlan({
      sex: snapshot?.profile.sex,
      weightKg: snapshot?.profile.weightKg,
      workouts,
      sweatTests,
      referenceTime: now,
    })
    if (!snapshot) {
      plan.missingData.push(
        "Connect and refresh Intervals.icu to include today's workouts.",
      )
    }
    if (plannedRows.some((row) => row.isIndoor !== true) && !settings) {
      plan.missingData.push(
        "Set a training location to match outdoor conditions.",
      )
    } else if (
      plannedRows.some((row) => row.isIndoor !== true) &&
      weatherStatus === "missing"
    ) {
      plan.missingData.push(
        "Weather is unavailable; the hydration target still uses a weather-free estimate.",
      )
    }
    return {
      ...plan,
      weatherStatus,
      locationName: settings?.displayName,
      disclaimer:
        "For healthy adults. Pregnancy, kidney or heart conditions, fluid restrictions, and other clinical circumstances require individual medical guidance.",
    }
  },
})

export const createSweatTest = action({
  args: {
    sourceActivityId: v.string(),
    preWeightKg: v.number(),
    postWeightKg: v.number(),
    consumedLitres: v.number(),
    urineLitres: v.optional(v.number()),
    scalePrecisionKg: v.optional(v.number()),
    volumePrecisionLitres: v.optional(v.number()),
    wetClothingAdjustmentKg: v.optional(v.number()),
    wetClothingUncertaintyKg: v.optional(v.number()),
    durationSeconds: v.number(),
  },
  returns: v.id("hydrationSweatTests"),
  handler: async (ctx, args): Promise<Id<"hydrationSweatTests">> => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const context = await ctx.runQuery(internal.hydration.getSweatTestContext, {
      ownerTokenIdentifier,
      sourceActivityId: args.sourceActivityId,
    })
    if (!context) throw new ConvexError({ code: "ACTIVITY_NOT_FOUND" })
    let weather:
      | {
          apparentTemperatureC: number
          temperatureC: number
          relativeHumidityPercent: number
        }
      | undefined
    if (!context.activity.isIndoor && context.location) {
      try {
        weather =
          (await ctx.runAction(internal.hydrationWeather.getHistoricalWeather, {
            latitude: context.location.latitude,
            longitude: context.location.longitude,
            timezone: context.location.timezone,
            localDateTime: context.activity.localStartDateTime,
          })) ?? undefined
      } catch {
        weather = undefined
      }
    }
    return await ctx.runMutation(internal.hydration.insertSweatTest, {
      ownerTokenIdentifier,
      ...args,
      activityName: context.activity.name,
      activityStartAt: context.activity.startAt,
      sport: context.activity.sport,
      isIndoor: context.activity.isIndoor,
      intensity: context.activity.intensity,
      intensityMetric: deriveIntensityMetric({
        ...context.activity,
        durationSeconds: args.durationSeconds,
      }),
      weather,
    })
  },
})
