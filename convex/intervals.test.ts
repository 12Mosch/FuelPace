/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test"
import { describe, expect, test } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"])
const identityA = { subject: "user-a", tokenIdentifier: "workos|user-a" }
const identityB = { subject: "user-b", tokenIdentifier: "workos|user-b" }

const credential = {
  athleteId: "athlete-1",
  athleteName: "Ada Rider",
  encryptedApiKey: "ciphertext",
  encryptionIv: "iv",
  encryptionVersion: "aes-256-gcm-v1" as const,
}

const profile = {
  athleteId: "athlete-1",
  athleteName: "Ada Rider",
  timezone: "Europe/Berlin",
}

async function connectionVersion(
  t: TestConvex<typeof schema>,
  ownerTokenIdentifier = identityA.tokenIdentifier,
) {
  return await t.run(async (ctx) => {
    const connection = await ctx.db
      .query("intervalsConnections")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()
    if (!connection?.connectionVersion) {
      throw new Error("Missing versioned connection")
    }
    return connection.connectionVersion
  })
}

describe("Intervals connections", () => {
  test("lazily migrates a pre-import connection on startup", async () => {
    const t = convexTest(schema, modules)
    await t.run((ctx) =>
      ctx.db.insert("intervalsConnections", {
        ownerTokenIdentifier: identityA.tokenIdentifier,
        ...credential,
        connectedAt: Date.now(),
        updatedAt: Date.now(),
      }),
    )

    expect(
      await t.withIdentity(identityA).query(api.intervals.getConnection, {}),
    ).toMatchObject({
      athleteId: credential.athleteId,
      syncStatus: "never_synced",
      importedProfileCount: 0,
    })
    await expect(
      t.withIdentity(identityA).mutation(api.intervals.requestSync, {}),
    ).resolves.toBe("scheduled")

    const migrated = await t.run(async (ctx) => {
      const connection = await ctx.db
        .query("intervalsConnections")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", identityA.tokenIdentifier),
        )
        .unique()
      const state = await ctx.db
        .query("intervalsSyncStates")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", identityA.tokenIdentifier),
        )
        .unique()
      return { connection, state }
    })
    expect(migrated.connection?.connectionVersion).toEqual(expect.any(String))
    expect(migrated.state).toMatchObject({
      connectionVersion: migrated.connection?.connectionVersion,
      status: "queued",
    })
  })

  test("rejects unauthenticated public functions before data access", async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.intervals.getConnection, {})).rejects.toThrow(
      "Not authenticated",
    )
    await expect(t.mutation(api.intervals.disconnect, {})).rejects.toThrow(
      "Not authenticated",
    )
    await expect(
      t.action(api.intervals.connectWithApiKey, { apiKey: "unused" }),
    ).rejects.toThrow("Not authenticated")
  })

  test("returns a non-secret summary scoped to the authenticated owner", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
    })

    const result = await t
      .withIdentity(identityA)
      .query(api.intervals.getConnection, {})
    expect(result).toMatchObject({
      athleteId: "athlete-1",
      athleteName: "Ada Rider",
    })
    expect(result).not.toHaveProperty("encryptedApiKey")
    expect(result).not.toHaveProperty("encryptionIv")
    expect(result).toMatchObject({
      syncStatus: "queued",
      importedProfileCount: 0,
      importedPlannedWorkoutCount: 0,
      importedActivityCount: 0,
    })
    expect(
      await t.withIdentity(identityB).query(api.intervals.getConnection, {}),
    ).toBeNull()
  })

  test("reconnect atomically replaces one existing connection", async () => {
    const t = convexTest(schema, modules)
    const first = await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
    })
    const second = await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
      athleteId: "athlete-2",
      athleteName: "New Name",
      encryptedApiKey: "new-ciphertext",
    })

    expect(second.connectedAt).toBe(first.connectedAt)
    expect(second.athleteId).toBe("athlete-2")
    const documents = await t.run((ctx) =>
      ctx.db.query("intervalsConnections").collect(),
    )
    expect(documents).toHaveLength(1)
    expect(documents[0]?.encryptedApiKey).toBe("new-ciphertext")
  })

  test("disconnect is owner-scoped and idempotent", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
    })
    await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityB.tokenIdentifier,
      ...credential,
      athleteId: "athlete-b",
    })

    expect(
      await t.withIdentity(identityA).mutation(api.intervals.disconnect, {}),
    ).toEqual({
      disconnected: true,
    })
    expect(
      await t.withIdentity(identityA).mutation(api.intervals.disconnect, {}),
    ).toEqual({
      disconnected: true,
    })
    expect(
      await t.withIdentity(identityB).query(api.intervals.getConnection, {}),
    ).not.toBeNull()
  })

  test("freshness and lease gates collapse startup sync requests", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
    })
    const stateId = await t.run(async (ctx) => {
      const state = await ctx.db
        .query("intervalsSyncStates")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", identityA.tokenIdentifier),
        )
        .unique()
      if (!state) throw new Error("Missing state")
      return state._id
    })
    await t.run((ctx) =>
      ctx.db.patch(stateId, {
        status: "idle",
        leaseExpiresAt: undefined,
        lastSuccessfulSyncAt: Date.now(),
      }),
    )
    await expect(
      t.withIdentity(identityA).mutation(api.intervals.requestSync, {}),
    ).resolves.toBe("fresh")

    await t.run((ctx) =>
      ctx.db.patch(stateId, { lastSuccessfulSyncAt: undefined }),
    )
    await expect(
      t.withIdentity(identityA).mutation(api.intervals.requestSync, {}),
    ).resolves.toBe("scheduled")
    await expect(
      t.withIdentity(identityA).mutation(api.intervals.requestSync, {}),
    ).resolves.toBe("already_running")
  })

  test("activates a complete snapshot and exposes only aggregate counts", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
    })
    const version = await connectionVersion(t)
    const runId = await t.mutation(internal.intervals.startImportRun, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      connectionVersion: version,
      profile,
      windowOldestLocalDate: "2026-03-22",
      windowNewestLocalDate: "2026-07-20",
      activitiesThroughAt: Date.now(),
    })
    expect(runId).not.toBeNull()
    if (!runId) return
    expect(
      await t.mutation(internal.intervals.writePlannedWorkoutBatch, {
        ownerTokenIdentifier: identityA.tokenIdentifier,
        connectionVersion: version,
        importRunId: runId,
        rows: [
          {
            sourceEventId: "e1",
            category: "workout",
            localStartDate: "2026-06-21",
          },
        ],
      }),
    ).toBe(true)
    expect(
      await t.mutation(internal.intervals.writeActivityBatch, {
        ownerTokenIdentifier: identityA.tokenIdentifier,
        connectionVersion: version,
        importRunId: runId,
        rows: [
          {
            sourceActivityId: "a1",
            startAt: Date.now() - 1000,
            localStartDateTime: "2026-06-20T08:00:00",
            sport: "Ride",
          },
        ],
      }),
    ).toBe(true)
    expect(
      await t.mutation(internal.intervals.activateImportRun, {
        ownerTokenIdentifier: identityA.tokenIdentifier,
        connectionVersion: version,
        importRunId: runId,
        profileCount: 1,
        plannedWorkoutCount: 1,
        activityCount: 1,
      }),
    ).toBe(true)
    const result = await t
      .withIdentity(identityA)
      .query(api.intervals.getConnection, {})
    expect(result).toMatchObject({
      syncStatus: "ready",
      importedProfileCount: 1,
      importedPlannedWorkoutCount: 1,
      importedActivityCount: 1,
    })
    expect(result).not.toHaveProperty("activeImportRunId")
  })

  test("a failed replacement preserves the prior active snapshot", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
    })
    const firstVersion = await connectionVersion(t)
    const firstRun = await t.mutation(internal.intervals.startImportRun, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      connectionVersion: firstVersion,
      profile,
      windowOldestLocalDate: "2026-03-22",
      windowNewestLocalDate: "2026-07-20",
      activitiesThroughAt: Date.now(),
    })
    if (!firstRun) throw new Error("Missing first run")
    await t.mutation(internal.intervals.activateImportRun, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      connectionVersion: firstVersion,
      importRunId: firstRun,
      profileCount: 1,
      plannedWorkoutCount: 0,
      activityCount: 0,
    })

    await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
      encryptedApiKey: "replacement",
    })
    const secondVersion = await connectionVersion(t)
    const secondRun = await t.mutation(internal.intervals.startImportRun, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      connectionVersion: secondVersion,
      profile,
      windowOldestLocalDate: "2026-03-22",
      windowNewestLocalDate: "2026-07-20",
      activitiesThroughAt: Date.now(),
    })
    if (!secondRun) throw new Error("Missing second run")
    await t.mutation(internal.intervals.recordImportFailure, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      connectionVersion: secondVersion,
      importRunId: secondRun,
      errorCode: "INVALID_RESPONSE",
    })
    const state = await t.run((ctx) =>
      ctx.db
        .query("intervalsSyncStates")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", identityA.tokenIdentifier),
        )
        .unique(),
    )
    expect(state?.activeImportRunId).toBe(firstRun)
    expect(state).toMatchObject({
      status: "failed",
      lastSyncErrorCode: "INVALID_RESPONSE",
      profileCount: 1,
    })
  })

  test("a different athlete hides the previous snapshot immediately", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
    })
    const firstVersion = await connectionVersion(t)
    const run = await t.mutation(internal.intervals.startImportRun, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      connectionVersion: firstVersion,
      profile,
      windowOldestLocalDate: "2026-03-22",
      windowNewestLocalDate: "2026-07-20",
      activitiesThroughAt: Date.now(),
    })
    if (!run) throw new Error("Missing run")
    await t.mutation(internal.intervals.activateImportRun, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      connectionVersion: firstVersion,
      importRunId: run,
      profileCount: 1,
      plannedWorkoutCount: 0,
      activityCount: 0,
    })
    await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
      athleteId: "athlete-2",
      athleteName: "Other Athlete",
    })
    const state = await t.run((ctx) =>
      ctx.db
        .query("intervalsSyncStates")
        .withIndex("by_ownerTokenIdentifier", (q) =>
          q.eq("ownerTokenIdentifier", identityA.tokenIdentifier),
        )
        .unique(),
    )
    expect(state?.activeImportRunId).toBeUndefined()
    expect(state?.profileCount).toBe(0)
  })
})
