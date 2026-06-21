/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test"
import { describe, expect, test } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"])
const identityA = { subject: "user-a", tokenIdentifier: "workos|user-a" }
const identityB = { subject: "user-b", tokenIdentifier: "workos|user-b" }

async function seedSnapshot(
  t: TestConvex<typeof schema>,
  ownerTokenIdentifier = identityA.tokenIdentifier,
) {
  return await t.run(async (ctx) => {
    const runId = await ctx.db.insert("intervalsImportRuns", {
      ownerTokenIdentifier,
      athleteId: "athlete",
      connectionVersion: "v1",
      status: "completed",
      windowOldestLocalDate: "2026-01-01",
      windowNewestLocalDate: "2026-12-31",
      activitiesThroughAt: Date.now(),
      startedAt: Date.now(),
      completedAt: Date.now(),
    })
    await ctx.db.insert("intervalsProfiles", {
      importRunId: runId,
      athleteId: "athlete",
      athleteName: "Ada",
      timezone: "UTC",
      sex: "female",
      weightKg: 60,
    })
    await ctx.db.insert("intervalsSyncStates", {
      ownerTokenIdentifier,
      connectionVersion: "v1",
      status: "idle",
      activeImportRunId: runId,
      profileCount: 1,
      plannedWorkoutCount: 0,
      activityCount: 0,
      updatedAt: Date.now(),
    })
    return runId
  })
}

describe("hydration Convex APIs", () => {
  test("requires authentication for public reads and writes", async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.hydration.getSettings, {})).rejects.toThrow(
      "Not authenticated",
    )
    await expect(t.mutation(api.hydration.clearLocation, {})).rejects.toThrow(
      "Not authenticated",
    )
    await expect(
      t.action(api.hydrationWeather.searchLocations, { query: "Berlin" }),
    ).rejects.toThrow("Not authenticated")
  })

  test("validates and owner-scopes one saved location", async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.withIdentity(identityA).mutation(api.hydration.saveLocation, {
        displayName: "Invalid",
        latitude: 120,
        longitude: 10,
        timezone: "UTC",
      }),
    ).rejects.toThrow()
    await t.withIdentity(identityA).mutation(api.hydration.saveLocation, {
      displayName: "Berlin, Germany",
      latitude: 52.52,
      longitude: 13.405,
      timezone: "Europe/Berlin",
    })
    await t.withIdentity(identityA).mutation(api.hydration.saveLocation, {
      displayName: "Freiburg, Germany",
      latitude: 48,
      longitude: 7.85,
      timezone: "Europe/Berlin",
    })
    expect(
      await t.withIdentity(identityA).query(api.hydration.getSettings, {}),
    ).toMatchObject({ displayName: "Freiburg, Germany" })
    expect(
      await t.withIdentity(identityB).query(api.hydration.getSettings, {}),
    ).toBeNull()
    expect(
      await t.run((ctx) => ctx.db.query("hydrationSettings").collect()),
    ).toHaveLength(1)
  })

  test("returns bounded eligible activities from only the active snapshot", async () => {
    const t = convexTest(schema, modules)
    const oldRun = await seedSnapshot(t)
    await t.run(async (ctx) => {
      await ctx.db.insert("intervalsActivities", {
        importRunId: oldRun,
        sourceActivityId: "eligible",
        startAt: Date.now(),
        localStartDateTime: "2026-06-20T08:00:00",
        sport: "Run",
        elapsedTimeSeconds: 3600,
      })
      await ctx.db.insert("intervalsActivities", {
        importRunId: oldRun,
        sourceActivityId: "untimed",
        startAt: Date.now() - 1,
        localStartDateTime: "2026-06-19T08:00:00",
        sport: "Run",
      })
    })
    expect(
      await t
        .withIdentity(identityA)
        .query(api.hydration.listCalibrationActivities, {}),
    ).toHaveLength(1)

    const nextRun = await t.run(async (ctx) => {
      const id = await ctx.db.insert("intervalsImportRuns", {
        ownerTokenIdentifier: identityA.tokenIdentifier,
        athleteId: "athlete",
        connectionVersion: "v1",
        status: "completed",
        windowOldestLocalDate: "2026-01-01",
        windowNewestLocalDate: "2026-12-31",
        activitiesThroughAt: Date.now(),
        startedAt: Date.now(),
      })
      await ctx.db.insert("intervalsProfiles", {
        importRunId: id,
        athleteId: "athlete",
        athleteName: "Ada",
        timezone: "UTC",
      })
      const state = await ctx.db
        .query("intervalsSyncStates")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", identityA.tokenIdentifier),
        )
        .unique()
      if (!state) throw new Error("missing state")
      await ctx.db.patch("intervalsSyncStates", state._id, {
        activeImportRunId: id,
      })
      return id
    })
    expect(nextRun).not.toBe(oldRun)
    expect(
      await t
        .withIdentity(identityA)
        .query(api.hydration.listCalibrationActivities, {}),
    ).toEqual([])
    expect(
      await t.query(internal.hydration.getSweatTestContext, {
        ownerTokenIdentifier: identityA.tokenIdentifier,
        sourceActivityId: "eligible",
      }),
    ).toBeNull()
  })

  test("stores valid sweat tests once and enforces ownership on deletion", async () => {
    const t = convexTest(schema, modules)
    const testId = await t.mutation(internal.hydration.insertSweatTest, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      sourceActivityId: "a1",
      activityStartAt: Date.now(),
      preWeightKg: 70,
      postWeightKg: 69.5,
      consumedLitres: 0.5,
      durationSeconds: 3600,
      sport: "Run",
      isIndoor: true,
      intensityMetric: { kind: "threshold_percent", value: 80 },
    })
    expect(
      (
        await t.withIdentity(identityA).query(api.hydration.listSweatTests, {})
      )[0],
    ).toMatchObject({
      sweatRateLitresPerHour: 1,
      intensityMetric: { kind: "threshold_percent", value: 80 },
    })
    await expect(
      t.mutation(internal.hydration.insertSweatTest, {
        ownerTokenIdentifier: identityA.tokenIdentifier,
        sourceActivityId: "a1",
        activityStartAt: Date.now(),
        preWeightKg: 70,
        postWeightKg: 69.5,
        consumedLitres: 0.5,
        durationSeconds: 3600,
        sport: "Run",
        isIndoor: true,
      }),
    ).rejects.toThrow()
    await expect(
      t
        .withIdentity(identityB)
        .mutation(api.hydration.deleteSweatTest, { id: testId }),
    ).rejects.toThrow()
    await t
      .withIdentity(identityA)
      .mutation(api.hydration.deleteSweatTest, { id: testId })
    expect(
      await t.withIdentity(identityA).query(api.hydration.listSweatTests, {}),
    ).toEqual([])
  })

  test("uses stale cache for six hours and drops older weather without dropping the target", async () => {
    const t = convexTest(schema, modules)
    const runId = await seedSnapshot(t)
    const today = new Date().toISOString().slice(0, 10)
    await t.withIdentity(identityA).mutation(api.hydration.saveLocation, {
      displayName: "UTC training base",
      latitude: 1,
      longitude: 2,
      timezone: "UTC",
    })
    await t.run((ctx) =>
      ctx.db.insert("intervalsPlannedWorkouts", {
        importRunId: runId,
        sourceEventId: "w1",
        category: "workout",
        localStartDate: today,
        localStartDateTime: `${today}T12:00:00`,
        sport: "Run",
        durationSeconds: 3600,
        isIndoor: false,
      }),
    )
    const hours = [
      {
        localDateTime: `${today}T12:00`,
        apparentTemperatureC: 20,
        temperatureC: 19,
        relativeHumidityPercent: 60,
      },
    ]
    await t.mutation(internal.hydration.upsertWeatherCache, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      latitude: 1,
      longitude: 2,
      timezone: "UTC",
      fetchedAt: Date.now() - 31 * 60 * 1000,
      hours,
    })
    expect(
      await t.withIdentity(identityA).query(api.hydration.getDailyPlan, {}),
    ).toMatchObject({
      targetType: "total_beverages",
      weatherStatus: "stale",
      displayTargetLitres: 1.6,
    })
    await t.mutation(internal.hydration.upsertWeatherCache, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      latitude: 1,
      longitude: 2,
      timezone: "America/New_York",
      fetchedAt: Date.now(),
      hours,
    })
    expect(
      await t.withIdentity(identityA).query(api.hydration.getDailyPlan, {}),
    ).toMatchObject({
      weatherStatus: "missing",
      displayTargetLitres: 1.6,
    })
    expect(
      await t.query(internal.hydration.getWeatherRefreshContext, {
        ownerTokenIdentifier: identityA.tokenIdentifier,
      }),
    ).toMatchObject({ isFresh: false })
    await t.mutation(internal.hydration.upsertWeatherCache, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      latitude: 1,
      longitude: 2,
      timezone: "UTC",
      fetchedAt: Date.now() - 7 * 60 * 60 * 1000,
      hours,
    })
    const plan = await t
      .withIdentity(identityA)
      .query(api.hydration.getDailyPlan, {})
    expect(plan).toMatchObject({
      weatherStatus: "missing",
      displayTargetLitres: 1.6,
    })
    expect(plan.missingData.join(" ")).toMatch(/Weather is unavailable/)
    expect(
      await t.run((ctx) => ctx.db.query("hydrationWeatherCaches").collect()),
    ).toHaveLength(1)
  })
})
