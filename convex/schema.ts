import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  intervalsConnections: defineTable({
    ownerTokenIdentifier: v.string(),
    athleteId: v.string(),
    athleteName: v.string(),
    encryptedApiKey: v.string(),
    encryptionIv: v.string(),
    encryptionVersion: v.literal("aes-256-gcm-v1"),
    // Optional during the online migration from pre-import connections.
    connectionVersion: v.optional(v.string()),
    connectedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerTokenIdentifier", ["ownerTokenIdentifier"]),

  intervalsSyncStates: defineTable({
    ownerTokenIdentifier: v.string(),
    connectionVersion: v.string(),
    status: v.union(
      v.literal("idle"),
      v.literal("queued"),
      v.literal("running"),
      v.literal("failed"),
    ),
    activeImportRunId: v.optional(v.id("intervalsImportRuns")),
    currentImportRunId: v.optional(v.id("intervalsImportRuns")),
    leaseExpiresAt: v.optional(v.number()),
    cooldownUntil: v.optional(v.number()),
    lastSyncAttemptAt: v.optional(v.number()),
    lastSuccessfulSyncAt: v.optional(v.number()),
    lastSyncErrorCode: v.optional(v.string()),
    profileCount: v.number(),
    plannedWorkoutCount: v.number(),
    activityCount: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerTokenIdentifier", ["ownerTokenIdentifier"]),

  intervalsImportRuns: defineTable({
    ownerTokenIdentifier: v.string(),
    athleteId: v.string(),
    connectionVersion: v.string(),
    status: v.union(
      v.literal("staging"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    windowOldestLocalDate: v.string(),
    windowNewestLocalDate: v.string(),
    activitiesThroughAt: v.number(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
  })
    .index("by_ownerTokenIdentifier", ["ownerTokenIdentifier"])
    .index("by_ownerTokenIdentifier_and_connectionVersion", [
      "ownerTokenIdentifier",
      "connectionVersion",
    ])
    .index("by_ownerTokenIdentifier_and_status", [
      "ownerTokenIdentifier",
      "status",
    ]),

  intervalsProfiles: defineTable({
    importRunId: v.id("intervalsImportRuns"),
    athleteId: v.string(),
    athleteName: v.string(),
    timezone: v.string(),
    locale: v.optional(v.string()),
    sex: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    weightKg: v.optional(v.number()),
    measurementPreference: v.optional(v.string()),
  }).index("by_importRunId", ["importRunId"]),

  intervalsPlannedWorkouts: defineTable({
    importRunId: v.id("intervalsImportRuns"),
    sourceEventId: v.string(),
    category: v.union(
      v.literal("workout"),
      v.literal("race_a"),
      v.literal("race_b"),
      v.literal("race_c"),
    ),
    sport: v.optional(v.string()),
    localStartDate: v.string(),
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
    .index("by_importRunId_and_sourceEventId", ["importRunId", "sourceEventId"])
    .index("by_importRunId_and_localStartDate", [
      "importRunId",
      "localStartDate",
    ]),

  intervalsActivities: defineTable({
    importRunId: v.id("intervalsImportRuns"),
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
    .index("by_importRunId_and_sourceActivityId", [
      "importRunId",
      "sourceActivityId",
    ])
    .index("by_importRunId_and_startAt", ["importRunId", "startAt"])
    .index("by_importRunId_and_localStartDateTime", [
      "importRunId",
      "localStartDateTime",
    ]),
})
