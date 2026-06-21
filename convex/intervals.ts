import { ConvexError, v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  query,
} from "./_generated/server"
import type {
  IntervalsActivity,
  IntervalsPlannedWorkout,
} from "./lib/intervals"

const FRESHNESS_MS = 15 * 60 * 1000
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000
const QUEUED_LEASE_MS = 2 * 60 * 1000
const RUNNING_LEASE_MS = 15 * 60 * 1000
const DELETE_BATCH_SIZE = 100
const CALENDAR_MONTH_LIMIT = 500
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/

const syncStatus = v.union(
  v.literal("queued"),
  v.literal("importing"),
  v.literal("ready"),
  v.literal("error"),
  v.literal("never_synced"),
)

const connectionSummary = v.object({
  athleteId: v.string(),
  athleteName: v.string(),
  connectedAt: v.number(),
  updatedAt: v.number(),
  syncStatus,
  lastSyncAttemptAt: v.optional(v.number()),
  lastSuccessfulSyncAt: v.optional(v.number()),
  lastSyncErrorCode: v.optional(v.string()),
  importedProfileCount: v.number(),
  importedPlannedWorkoutCount: v.number(),
  importedActivityCount: v.number(),
})

type SyncStatus = "queued" | "importing" | "ready" | "error" | "never_synced"

type ConnectionSummary = {
  athleteId: string
  athleteName: string
  connectedAt: number
  updatedAt: number
  syncStatus: SyncStatus
  lastSyncAttemptAt?: number
  lastSuccessfulSyncAt?: number
  lastSyncErrorCode?: string
  importedProfileCount: number
  importedPlannedWorkoutCount: number
  importedActivityCount: number
}

type CalendarSyncSummary = {
  syncStatus: SyncStatus
  lastSyncAttemptAt?: number
  lastSuccessfulSyncAt?: number
  lastSyncErrorCode?: string
}

type CalendarQueryResult =
  | {
      state: "disconnected"
      syncStatus: "never_synced"
      plannedWorkouts: IntervalsPlannedWorkout[]
      activities: Array<Omit<IntervalsActivity, "startAt">>
      truncated: boolean
    }
  | ({
      state: "awaiting_first_import"
      plannedWorkouts: IntervalsPlannedWorkout[]
      activities: Array<Omit<IntervalsActivity, "startAt">>
      truncated: boolean
    } & CalendarSyncSummary)
  | ({
      state: "available"
      timezone: string
      locale?: string
      importedWindow: {
        oldestLocalDate: string
        newestLocalDate: string
        activitiesThroughAt: number
      }
      plannedWorkouts: IntervalsPlannedWorkout[]
      activities: Array<Omit<IntervalsActivity, "startAt">>
      truncated: boolean
    } & CalendarSyncSummary)

type EncryptedConnection = {
  athleteId: string
  athleteName: string
  encryptedApiKey: string
  encryptionIv: string
  encryptionVersion: "aes-256-gcm-v1"
}

const profileValidator = v.object({
  athleteId: v.string(),
  athleteName: v.string(),
  timezone: v.string(),
  locale: v.optional(v.string()),
  sex: v.optional(v.string()),
  birthDate: v.optional(v.string()),
  weightKg: v.optional(v.number()),
  measurementPreference: v.optional(v.string()),
})

const plannedWorkoutValidator = v.object({
  sourceEventId: v.string(),
  category: v.union(
    v.literal("workout"),
    v.literal("race_a"),
    v.literal("race_b"),
    v.literal("race_c"),
  ),
  sport: v.optional(v.string()),
  localStartDate: v.string(),
  localStartDateTime: v.optional(v.string()),
  localEndDate: v.optional(v.string()),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  durationSeconds: v.optional(v.number()),
  distanceMetres: v.optional(v.number()),
  trainingLoad: v.optional(v.number()),
  intensity: v.optional(v.number()),
  workJoules: v.optional(v.number()),
  carbohydratesUsedGrams: v.optional(v.number()),
  carbohydratesIntakeGrams: v.optional(v.number()),
  isIndoor: v.optional(v.boolean()),
  targetType: v.optional(v.string()),
  sourceUpdatedAt: v.optional(v.number()),
})

const activityValidator = v.object({
  sourceActivityId: v.string(),
  startAt: v.number(),
  localStartDateTime: v.string(),
  sport: v.string(),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  movingTimeSeconds: v.optional(v.number()),
  elapsedTimeSeconds: v.optional(v.number()),
  distanceMetres: v.optional(v.number()),
  caloriesKilocalories: v.optional(v.number()),
  trainingLoad: v.optional(v.number()),
  intensity: v.optional(v.number()),
  workJoules: v.optional(v.number()),
  carbohydratesUsedGrams: v.optional(v.number()),
  carbohydratesIntakeGrams: v.optional(v.number()),
  averageHeartRate: v.optional(v.number()),
  maxHeartRate: v.optional(v.number()),
  averagePowerWatts: v.optional(v.number()),
  weightedAveragePowerWatts: v.optional(v.number()),
  source: v.optional(v.string()),
  pairedEventId: v.optional(v.string()),
  isCommute: v.optional(v.boolean()),
  isIndoor: v.optional(v.boolean()),
  isManual: v.optional(v.boolean()),
  isPrivate: v.optional(v.boolean()),
})

const calendarActivityValidator = v.object({
  sourceActivityId: v.string(),
  localStartDateTime: v.string(),
  sport: v.string(),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  movingTimeSeconds: v.optional(v.number()),
  elapsedTimeSeconds: v.optional(v.number()),
  distanceMetres: v.optional(v.number()),
  caloriesKilocalories: v.optional(v.number()),
  trainingLoad: v.optional(v.number()),
  intensity: v.optional(v.number()),
  workJoules: v.optional(v.number()),
  carbohydratesUsedGrams: v.optional(v.number()),
  carbohydratesIntakeGrams: v.optional(v.number()),
  averageHeartRate: v.optional(v.number()),
  maxHeartRate: v.optional(v.number()),
  averagePowerWatts: v.optional(v.number()),
  weightedAveragePowerWatts: v.optional(v.number()),
  source: v.optional(v.string()),
  pairedEventId: v.optional(v.string()),
  isCommute: v.optional(v.boolean()),
  isIndoor: v.optional(v.boolean()),
  isManual: v.optional(v.boolean()),
  isPrivate: v.optional(v.boolean()),
})

const calendarSyncFields = {
  syncStatus,
  lastSyncAttemptAt: v.optional(v.number()),
  lastSuccessfulSyncAt: v.optional(v.number()),
  lastSyncErrorCode: v.optional(v.string()),
}

async function requireOwner(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> }
}) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Not authenticated")
  return identity.tokenIdentifier
}

function publicSyncStatus(state: {
  status: "idle" | "queued" | "running" | "failed"
  lastSuccessfulSyncAt?: number
}): SyncStatus {
  if (state.status === "queued") return "queued"
  if (state.status === "running") return "importing"
  if (state.status === "failed") return "error"
  return state.lastSuccessfulSyncAt === undefined ? "never_synced" : "ready"
}

function summarize(
  connection: {
    athleteId: string
    athleteName: string
    connectedAt: number
    updatedAt: number
  },
  state: {
    status: "idle" | "queued" | "running" | "failed"
    lastSyncAttemptAt?: number
    lastSuccessfulSyncAt?: number
    lastSyncErrorCode?: string
    profileCount: number
    plannedWorkoutCount: number
    activityCount: number
  },
): ConnectionSummary {
  return {
    athleteId: connection.athleteId,
    athleteName: connection.athleteName,
    connectedAt: connection.connectedAt,
    updatedAt: connection.updatedAt,
    syncStatus: publicSyncStatus(state),
    lastSyncAttemptAt: state.lastSyncAttemptAt,
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
    lastSyncErrorCode: state.lastSyncErrorCode,
    importedProfileCount: state.profileCount,
    importedPlannedWorkoutCount: state.plannedWorkoutCount,
    importedActivityCount: state.activityCount,
  }
}

function nextMonth(month: string): string {
  const match = MONTH_PATTERN.exec(month)
  if (!match) throw new ConvexError({ code: "INVALID_MONTH" })
  const year = Number(match[1])
  const monthNumber = Number(match[2])
  if (year < 1 || year > 9999 || monthNumber < 1 || monthNumber > 12) {
    throw new ConvexError({ code: "INVALID_MONTH" })
  }
  const nextYear = monthNumber === 12 ? year + 1 : year
  if (nextYear > 9999) throw new ConvexError({ code: "INVALID_MONTH" })
  const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonthNumber).padStart(2, "0")}`
}

export const getCalendarMonth = query({
  args: { month: v.string() },
  returns: v.union(
    v.object({
      state: v.literal("disconnected"),
      syncStatus: v.literal("never_synced"),
      plannedWorkouts: v.array(plannedWorkoutValidator),
      activities: v.array(calendarActivityValidator),
      truncated: v.boolean(),
    }),
    v.object({
      state: v.literal("awaiting_first_import"),
      ...calendarSyncFields,
      plannedWorkouts: v.array(plannedWorkoutValidator),
      activities: v.array(calendarActivityValidator),
      truncated: v.boolean(),
    }),
    v.object({
      state: v.literal("available"),
      ...calendarSyncFields,
      timezone: v.string(),
      locale: v.optional(v.string()),
      importedWindow: v.object({
        oldestLocalDate: v.string(),
        newestLocalDate: v.string(),
        activitiesThroughAt: v.number(),
      }),
      plannedWorkouts: v.array(plannedWorkoutValidator),
      activities: v.array(calendarActivityValidator),
      truncated: v.boolean(),
    }),
  ),
  handler: async (ctx, { month }): Promise<CalendarQueryResult> => {
    const followingMonth = nextMonth(month)
    const ownerTokenIdentifier = await requireOwner(ctx)
    const connection = await ctx.db
      .query("intervalsConnections")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()
    const state = await ctx.db
      .query("intervalsSyncStates")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()

    if (
      !connection?.connectionVersion ||
      !state ||
      state.connectionVersion !== connection.connectionVersion
    ) {
      return {
        state: "disconnected" as const,
        syncStatus: "never_synced" as const,
        plannedWorkouts: [],
        activities: [],
        truncated: false,
      }
    }

    const syncSummary = {
      syncStatus: publicSyncStatus(state),
      lastSyncAttemptAt: state.lastSyncAttemptAt,
      lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
      lastSyncErrorCode: state.lastSyncErrorCode,
    }
    if (!state.activeImportRunId) {
      return {
        state: "awaiting_first_import" as const,
        ...syncSummary,
        plannedWorkouts: [],
        activities: [],
        truncated: false,
      }
    }

    const activeImportRunId = state.activeImportRunId
    const run = await ctx.db.get(activeImportRunId)
    if (
      run?.status !== "completed" ||
      run.ownerTokenIdentifier !== ownerTokenIdentifier ||
      run.connectionVersion !== connection.connectionVersion
    ) {
      return {
        state: "awaiting_first_import" as const,
        ...syncSummary,
        plannedWorkouts: [],
        activities: [],
        truncated: false,
      }
    }

    const [profile, plannedRows, activityRows] = await Promise.all([
      ctx.db
        .query("intervalsProfiles")
        .withIndex("by_importRunId", (q) =>
          q.eq("importRunId", activeImportRunId),
        )
        .unique(),
      ctx.db
        .query("intervalsPlannedWorkouts")
        .withIndex("by_importRunId_and_localStartDate", (q) =>
          q
            .eq("importRunId", activeImportRunId)
            .gte("localStartDate", `${month}-01`)
            .lt("localStartDate", `${followingMonth}-01`),
        )
        .take(CALENDAR_MONTH_LIMIT + 1),
      ctx.db
        .query("intervalsActivities")
        .withIndex("by_importRunId_and_localStartDateTime", (q) =>
          q
            .eq("importRunId", activeImportRunId)
            .gte("localStartDateTime", `${month}-01`)
            .lt("localStartDateTime", `${followingMonth}-01`),
        )
        .take(CALENDAR_MONTH_LIMIT + 1),
    ])
    if (!profile) throw new Error("Active import profile is missing")

    const combined = [
      ...plannedRows.map((row) => ({ kind: "planned" as const, row })),
      ...activityRows.map((row) => ({ kind: "activity" as const, row })),
    ]
      .sort((left, right) => {
        const leftDate =
          left.kind === "planned"
            ? (left.row.localStartDateTime ?? left.row.localStartDate)
            : left.row.localStartDateTime
        const rightDate =
          right.kind === "planned"
            ? (right.row.localStartDateTime ?? right.row.localStartDate)
            : right.row.localStartDateTime
        return leftDate.localeCompare(rightDate)
      })
      .slice(0, CALENDAR_MONTH_LIMIT)

    const plannedWorkouts = combined.flatMap((entry) =>
      entry.kind === "planned"
        ? [
            {
              sourceEventId: entry.row.sourceEventId,
              category: entry.row.category,
              sport: entry.row.sport,
              localStartDate: entry.row.localStartDate,
              localStartDateTime: entry.row.localStartDateTime,
              localEndDate: entry.row.localEndDate,
              name: entry.row.name,
              description: entry.row.description,
              durationSeconds: entry.row.durationSeconds,
              distanceMetres: entry.row.distanceMetres,
              trainingLoad: entry.row.trainingLoad,
              intensity: entry.row.intensity,
              workJoules: entry.row.workJoules,
              carbohydratesUsedGrams: entry.row.carbohydratesUsedGrams,
              carbohydratesIntakeGrams: entry.row.carbohydratesIntakeGrams,
              isIndoor: entry.row.isIndoor,
              targetType: entry.row.targetType,
            },
          ]
        : [],
    )
    const activities = combined.flatMap((entry) =>
      entry.kind === "activity"
        ? [
            {
              sourceActivityId: entry.row.sourceActivityId,
              localStartDateTime: entry.row.localStartDateTime,
              sport: entry.row.sport,
              name: entry.row.name,
              description: entry.row.description,
              movingTimeSeconds: entry.row.movingTimeSeconds,
              elapsedTimeSeconds: entry.row.elapsedTimeSeconds,
              distanceMetres: entry.row.distanceMetres,
              caloriesKilocalories: entry.row.caloriesKilocalories,
              trainingLoad: entry.row.trainingLoad,
              intensity: entry.row.intensity,
              workJoules: entry.row.workJoules,
              carbohydratesUsedGrams: entry.row.carbohydratesUsedGrams,
              carbohydratesIntakeGrams: entry.row.carbohydratesIntakeGrams,
              averageHeartRate: entry.row.averageHeartRate,
              maxHeartRate: entry.row.maxHeartRate,
              averagePowerWatts: entry.row.averagePowerWatts,
              weightedAveragePowerWatts: entry.row.weightedAveragePowerWatts,
              source: entry.row.source,
              pairedEventId: entry.row.pairedEventId,
              isCommute: entry.row.isCommute,
              isIndoor: entry.row.isIndoor,
              isManual: entry.row.isManual,
              isPrivate: entry.row.isPrivate,
            },
          ]
        : [],
    )

    return {
      state: "available" as const,
      ...syncSummary,
      timezone: profile.timezone,
      locale: profile.locale,
      importedWindow: {
        oldestLocalDate: run.windowOldestLocalDate,
        newestLocalDate: run.windowNewestLocalDate,
        activitiesThroughAt: run.activitiesThroughAt,
      },
      plannedWorkouts,
      activities,
      truncated:
        plannedRows.length + activityRows.length > CALENDAR_MONTH_LIMIT,
    }
  },
})

export const getConnection = query({
  args: {},
  returns: v.union(connectionSummary, v.null()),
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const connection = await ctx.db
      .query("intervalsConnections")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()
    if (!connection) return null
    const state = await ctx.db
      .query("intervalsSyncStates")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()
    if (!connection.connectionVersion || !state) {
      return summarize(connection, {
        status: "idle",
        profileCount: 0,
        plannedWorkoutCount: 0,
        activityCount: 0,
      })
    }
    if (state.connectionVersion !== connection.connectionVersion) {
      return null
    }
    return summarize(connection, state)
  },
})

export const connectWithApiKey = action({
  args: { apiKey: v.string() },
  returns: connectionSummary,
  handler: async (ctx, { apiKey }): Promise<ConnectionSummary> => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const trimmedApiKey = apiKey.trim()
    if (!trimmedApiKey) throw new ConvexError({ code: "INVALID_API_KEY" })
    const credential: EncryptedConnection = await ctx.runAction(
      internal.intervalsNode.validateAndEncrypt,
      { apiKey: trimmedApiKey },
    )
    return await ctx.runMutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier,
      ...credential,
    })
  },
})

export const upsertConnection = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    athleteId: v.string(),
    athleteName: v.string(),
    encryptedApiKey: v.string(),
    encryptionIv: v.string(),
    encryptionVersion: v.literal("aes-256-gcm-v1"),
  },
  returns: connectionSummary,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("intervalsConnections")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier),
      )
      .unique()
    const existingState = await ctx.db
      .query("intervalsSyncStates")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier),
      )
      .unique()
    const now = Date.now()
    const connectionVersion = crypto.randomUUID()
    const connectedAt = existing?.connectedAt ?? now
    const sameAthlete = existing?.athleteId === args.athleteId
    const connection = {
      ...args,
      connectionVersion,
      connectedAt,
      updatedAt: now,
    }
    if (existing) await ctx.db.replace(existing._id, connection)
    else await ctx.db.insert("intervalsConnections", connection)

    const state = {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      connectionVersion,
      status: "queued" as const,
      activeImportRunId: sameAthlete
        ? existingState?.activeImportRunId
        : undefined,
      leaseExpiresAt: now + QUEUED_LEASE_MS,
      lastSyncAttemptAt: existingState?.lastSyncAttemptAt,
      lastSuccessfulSyncAt: sameAthlete
        ? existingState?.lastSuccessfulSyncAt
        : undefined,
      profileCount: sameAthlete ? (existingState?.profileCount ?? 0) : 0,
      plannedWorkoutCount: sameAthlete
        ? (existingState?.plannedWorkoutCount ?? 0)
        : 0,
      activityCount: sameAthlete ? (existingState?.activityCount ?? 0) : 0,
      updatedAt: now,
    }
    if (existingState) await ctx.db.replace(existingState._id, state)
    else await ctx.db.insert("intervalsSyncStates", state)
    if (existing?.connectionVersion && !sameAthlete) {
      await ctx.scheduler.runAfter(0, internal.intervals.cleanupConnection, {
        ownerTokenIdentifier: args.ownerTokenIdentifier,
        connectionVersion: existing.connectionVersion,
      })
    }
    await ctx.scheduler.runAfter(
      0,
      internal.intervalsNode.importIntervalsData,
      {
        ownerTokenIdentifier: args.ownerTokenIdentifier,
        connectionVersion,
      },
    )
    return summarize(connection, state)
  },
})

export const requestSync = mutation({
  args: {},
  returns: v.union(
    v.literal("not_connected"),
    v.literal("fresh"),
    v.literal("already_running"),
    v.literal("scheduled"),
  ),
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const connection = await ctx.db
      .query("intervalsConnections")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()
    if (!connection) return "not_connected"
    const state = await ctx.db
      .query("intervalsSyncStates")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()
    const now = Date.now()
    if (!connection.connectionVersion || !state) {
      const connectionVersion = crypto.randomUUID()
      await ctx.db.patch(connection._id, { connectionVersion, updatedAt: now })
      const migratedState = {
        ownerTokenIdentifier,
        connectionVersion,
        status: "queued" as const,
        leaseExpiresAt: now + QUEUED_LEASE_MS,
        profileCount: 0,
        plannedWorkoutCount: 0,
        activityCount: 0,
        updatedAt: now,
      }
      if (state) await ctx.db.replace(state._id, migratedState)
      else await ctx.db.insert("intervalsSyncStates", migratedState)
      await ctx.scheduler.runAfter(
        0,
        internal.intervalsNode.importIntervalsData,
        { ownerTokenIdentifier, connectionVersion },
      )
      return "scheduled"
    }
    if (state.connectionVersion !== connection.connectionVersion) {
      return "not_connected"
    }
    if (
      state.lastSuccessfulSyncAt !== undefined &&
      now - state.lastSuccessfulSyncAt < FRESHNESS_MS
    ) {
      return "fresh"
    }
    if (
      (state.status === "queued" || state.status === "running") &&
      (state.leaseExpiresAt ?? 0) > now
    ) {
      return "already_running"
    }
    if (state.status === "failed" && (state.cooldownUntil ?? 0) > now) {
      return "fresh"
    }
    if (state.currentImportRunId) {
      await ctx.scheduler.runAfter(0, internal.intervals.cleanupSnapshot, {
        importRunId: state.currentImportRunId,
      })
    }
    await ctx.db.patch(state._id, {
      status: "queued",
      currentImportRunId: undefined,
      leaseExpiresAt: now + QUEUED_LEASE_MS,
      cooldownUntil: undefined,
      lastSyncErrorCode: undefined,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(
      0,
      internal.intervalsNode.importIntervalsData,
      {
        ownerTokenIdentifier,
        connectionVersion: connection.connectionVersion,
      },
    )
    return "scheduled"
  },
})

export const getImportContext = internalQuery({
  args: {
    ownerTokenIdentifier: v.string(),
    connectionVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("intervalsConnections")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier),
      )
      .unique()
    const state = await ctx.db
      .query("intervalsSyncStates")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier),
      )
      .unique()
    if (
      !connection ||
      !state ||
      connection.connectionVersion !== args.connectionVersion ||
      state.connectionVersion !== args.connectionVersion ||
      state.status !== "queued"
    ) {
      return null
    }
    return {
      athleteId: connection.athleteId,
      encryptedApiKey: connection.encryptedApiKey,
      encryptionIv: connection.encryptionIv,
      encryptionVersion: connection.encryptionVersion,
    }
  },
})

export const startImportRun = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    connectionVersion: v.string(),
    profile: profileValidator,
    windowOldestLocalDate: v.string(),
    windowNewestLocalDate: v.string(),
    activitiesThroughAt: v.number(),
  },
  returns: v.union(v.id("intervalsImportRuns"), v.null()),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("intervalsConnections")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier),
      )
      .unique()
    const state = await ctx.db
      .query("intervalsSyncStates")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier),
      )
      .unique()
    if (
      !connection ||
      !state ||
      connection.connectionVersion !== args.connectionVersion ||
      state.connectionVersion !== args.connectionVersion ||
      state.status !== "queued" ||
      connection.athleteId !== args.profile.athleteId
    ) {
      return null
    }
    const now = Date.now()
    const importRunId = await ctx.db.insert("intervalsImportRuns", {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      athleteId: args.profile.athleteId,
      connectionVersion: args.connectionVersion,
      status: "staging",
      windowOldestLocalDate: args.windowOldestLocalDate,
      windowNewestLocalDate: args.windowNewestLocalDate,
      activitiesThroughAt: args.activitiesThroughAt,
      startedAt: now,
    })
    await ctx.db.insert("intervalsProfiles", {
      importRunId,
      ...args.profile,
    })
    await ctx.db.patch(state._id, {
      status: "running",
      currentImportRunId: importRunId,
      leaseExpiresAt: now + RUNNING_LEASE_MS,
      lastSyncAttemptAt: now,
      lastSyncErrorCode: undefined,
      updatedAt: now,
    })
    return importRunId
  },
})

async function isCurrentRun(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  connectionVersion: string,
  importRunId: Id<"intervalsImportRuns">,
) {
  const connection = await ctx.db
    .query("intervalsConnections")
    .withIndex("by_ownerTokenIdentifier", (q) =>
      q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
    )
    .unique()
  const state = await ctx.db
    .query("intervalsSyncStates")
    .withIndex("by_ownerTokenIdentifier", (q) =>
      q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
    )
    .unique()
  const run = await ctx.db.get(importRunId)
  return Boolean(
    connection &&
      state &&
      run &&
      connection.connectionVersion === connectionVersion &&
      state.connectionVersion === connectionVersion &&
      state.status === "running" &&
      state.currentImportRunId === importRunId &&
      run.connectionVersion === connectionVersion &&
      run.status === "staging",
  )
}

export const writePlannedWorkoutBatch = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    connectionVersion: v.string(),
    importRunId: v.id("intervalsImportRuns"),
    rows: v.array(plannedWorkoutValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (
      !(await isCurrentRun(
        ctx,
        args.ownerTokenIdentifier,
        args.connectionVersion,
        args.importRunId,
      ))
    ) {
      return false
    }
    for (const row of args.rows) {
      await ctx.db.insert("intervalsPlannedWorkouts", {
        importRunId: args.importRunId,
        ...row,
      })
    }
    return true
  },
})

export const writeActivityBatch = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    connectionVersion: v.string(),
    importRunId: v.id("intervalsImportRuns"),
    rows: v.array(activityValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (
      !(await isCurrentRun(
        ctx,
        args.ownerTokenIdentifier,
        args.connectionVersion,
        args.importRunId,
      ))
    ) {
      return false
    }
    for (const row of args.rows) {
      await ctx.db.insert("intervalsActivities", {
        importRunId: args.importRunId,
        ...row,
      })
    }
    return true
  },
})

export const activateImportRun = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    connectionVersion: v.string(),
    importRunId: v.id("intervalsImportRuns"),
    profileCount: v.number(),
    plannedWorkoutCount: v.number(),
    activityCount: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (
      !(await isCurrentRun(
        ctx,
        args.ownerTokenIdentifier,
        args.connectionVersion,
        args.importRunId,
      ))
    ) {
      return false
    }
    const state = await ctx.db
      .query("intervalsSyncStates")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier),
      )
      .unique()
    if (!state) return false
    const oldActiveImportRunId = state.activeImportRunId
    const now = Date.now()
    await ctx.db.patch(args.importRunId, {
      status: "completed",
      completedAt: now,
    })
    await ctx.db.patch(state._id, {
      status: "idle",
      activeImportRunId: args.importRunId,
      currentImportRunId: undefined,
      leaseExpiresAt: undefined,
      cooldownUntil: undefined,
      lastSuccessfulSyncAt: now,
      lastSyncErrorCode: undefined,
      profileCount: args.profileCount,
      plannedWorkoutCount: args.plannedWorkoutCount,
      activityCount: args.activityCount,
      updatedAt: now,
    })
    if (oldActiveImportRunId && oldActiveImportRunId !== args.importRunId) {
      await ctx.scheduler.runAfter(0, internal.intervals.cleanupSnapshot, {
        importRunId: oldActiveImportRunId,
      })
    }
    return true
  },
})

export const recordImportFailure = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    connectionVersion: v.string(),
    importRunId: v.optional(v.id("intervalsImportRuns")),
    errorCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("intervalsSyncStates")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier),
      )
      .unique()
    if (
      !state ||
      state.connectionVersion !== args.connectionVersion ||
      (args.importRunId !== undefined &&
        state.currentImportRunId !== args.importRunId)
    ) {
      return null
    }
    const now = Date.now()
    if (args.importRunId) {
      const run = await ctx.db.get(args.importRunId)
      if (run?.status === "staging") {
        await ctx.db.patch(run._id, { status: "failed", failedAt: now })
        await ctx.scheduler.runAfter(0, internal.intervals.cleanupSnapshot, {
          importRunId: run._id,
        })
      }
    }
    await ctx.db.patch(state._id, {
      status: "failed",
      currentImportRunId: undefined,
      leaseExpiresAt: undefined,
      cooldownUntil: now + FAILURE_COOLDOWN_MS,
      lastSyncAttemptAt: state.lastSyncAttemptAt ?? now,
      lastSyncErrorCode: args.errorCode,
      updatedAt: now,
    })
    return null
  },
})

export const disconnect = mutation({
  args: {},
  returns: v.object({ disconnected: v.boolean() }),
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const connection = await ctx.db
      .query("intervalsConnections")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()
    const state = await ctx.db
      .query("intervalsSyncStates")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()
    if (connection) {
      await ctx.db.delete(connection._id)
      if (connection.connectionVersion) {
        await ctx.scheduler.runAfter(0, internal.intervals.cleanupConnection, {
          ownerTokenIdentifier,
          connectionVersion: connection.connectionVersion,
        })
      }
    }
    if (state?.activeImportRunId) {
      await ctx.scheduler.runAfter(0, internal.intervals.cleanupSnapshot, {
        importRunId: state.activeImportRunId,
      })
    }
    if (
      state?.currentImportRunId &&
      state.currentImportRunId !== state.activeImportRunId
    ) {
      await ctx.scheduler.runAfter(0, internal.intervals.cleanupSnapshot, {
        importRunId: state.currentImportRunId,
      })
    }
    if (state) await ctx.db.delete(state._id)
    return { disconnected: true }
  },
})

export const cleanupSnapshot = internalMutation({
  args: { importRunId: v.id("intervalsImportRuns") },
  returns: v.null(),
  handler: async (ctx, { importRunId }) => {
    const run = await ctx.db.get(importRunId)
    if (!run) return null
    const state = await ctx.db
      .query("intervalsSyncStates")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", run.ownerTokenIdentifier),
      )
      .unique()
    if (state?.activeImportRunId === importRunId) return null

    const profiles = await ctx.db
      .query("intervalsProfiles")
      .withIndex("by_importRunId", (q) => q.eq("importRunId", importRunId))
      .take(DELETE_BATCH_SIZE)
    const workouts = await ctx.db
      .query("intervalsPlannedWorkouts")
      .withIndex("by_importRunId_and_sourceEventId", (q) =>
        q.eq("importRunId", importRunId),
      )
      .take(DELETE_BATCH_SIZE)
    const activities = await ctx.db
      .query("intervalsActivities")
      .withIndex("by_importRunId_and_sourceActivityId", (q) =>
        q.eq("importRunId", importRunId),
      )
      .take(DELETE_BATCH_SIZE)
    for (const row of [...profiles, ...workouts, ...activities]) {
      await ctx.db.delete(row._id)
    }
    if (
      profiles.length === DELETE_BATCH_SIZE ||
      workouts.length === DELETE_BATCH_SIZE ||
      activities.length === DELETE_BATCH_SIZE
    ) {
      await ctx.scheduler.runAfter(0, internal.intervals.cleanupSnapshot, {
        importRunId,
      })
    } else {
      await ctx.db.delete(importRunId)
    }
    return null
  },
})

export const cleanupConnection = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    connectionVersion: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("intervalsImportRuns")
      .withIndex("by_ownerTokenIdentifier_and_connectionVersion", (q) =>
        q
          .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
          .eq("connectionVersion", args.connectionVersion),
      )
      .first()
    if (!run) return null
    await ctx.scheduler.runAfter(0, internal.intervals.cleanupSnapshot, {
      importRunId: run._id,
    })
    await ctx.scheduler.runAfter(
      100,
      internal.intervals.cleanupConnection,
      args,
    )
    return null
  },
})
