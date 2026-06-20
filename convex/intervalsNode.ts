"use node"

import { ConvexError, v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalAction } from "./_generated/server"
import { decryptCredential, encryptCredential } from "./lib/credentialCrypto"
import {
  createInclusiveDateChunks,
  deduplicateBySourceId,
  type IntervalsActivity,
  type IntervalsAthlete,
  type IntervalsPlannedWorkout,
  type IntervalsProfile,
  localDateForInstant,
  parseIntervalsActivitiesResponse,
  parseIntervalsAthleteResponse,
  parseIntervalsPlannedWorkoutsResponse,
  parseIntervalsProfileResponse,
  rollingImportWindow,
} from "./lib/intervals"

const API_ROOT = "https://intervals.icu/api/v1"
const REQUEST_TIMEOUT_MS = 10_000
const MAX_RETRIES = 3
const MAX_RETRY_DELAY_MS = 5_000
const IMPORT_BATCH_SIZE = 75
const EVENT_CATEGORIES = ["WORKOUT", "RACE_A", "RACE_B", "RACE_C"]
const ACTIVITY_FIELDS = [
  "id",
  "start_date",
  "start_date_local",
  "type",
  "name",
  "description",
  "moving_time",
  "elapsed_time",
  "distance",
  "icu_distance",
  "calories",
  "icu_training_load",
  "icu_intensity",
  "icu_joules",
  "carbs_used",
  "carbs_ingested",
  "average_heartrate",
  "max_heartrate",
  "average_watts",
  "icu_average_watts",
  "icu_weighted_avg_watts",
  "icu_normalized_watts",
  "source",
  "paired_event_id",
  "commute",
  "trainer",
  "manual",
  "private",
]

type IntervalsErrorCode =
  | "INVALID_API_KEY"
  | "INTERVALS_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "STALE_IMPORT"

function intervalsError(
  code: IntervalsErrorCode,
): ConvexError<{ code: IntervalsErrorCode }> {
  return new ConvexError({ code })
}

function sanitizedErrorCode(error: unknown): IntervalsErrorCode {
  if (error instanceof ConvexError) {
    const code = (error.data as { code?: unknown }).code
    if (
      code === "INVALID_API_KEY" ||
      code === "INTERVALS_UNAVAILABLE" ||
      code === "INVALID_RESPONSE" ||
      code === "STALE_IMPORT"
    ) {
      return code
    }
  }
  return "INTERVALS_UNAVAILABLE"
}

export function buildIntervalsBasicAuthorization(apiKey: string): string {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`, "utf8").toString("base64")}`
}

function retryAfterMilliseconds(response: Response, attempt: number): number {
  const value = response.headers.get("Retry-After")
  if (value) {
    const seconds = Number(value)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS)
    }
    const instant = Date.parse(value)
    if (Number.isFinite(instant)) {
      return Math.min(Math.max(0, instant - Date.now()), MAX_RETRY_DELAY_MS)
    }
  }
  return Math.min(250 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS)
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

export async function fetchIntervalsJson(
  url: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
  sleep: (milliseconds: number) => Promise<void> = defaultSleep,
): Promise<unknown> {
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    let response: Response
    try {
      response = await fetcher(url, {
        headers: {
          Authorization: buildIntervalsBasicAuthorization(apiKey),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      if (attempt > MAX_RETRIES) {
        throw intervalsError("INTERVALS_UNAVAILABLE")
      }
      await sleep(retryAfterMilliseconds(new Response(), attempt))
      continue
    }

    if (response.status === 401 || response.status === 403) {
      throw intervalsError("INVALID_API_KEY")
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt > MAX_RETRIES) {
        throw intervalsError("INTERVALS_UNAVAILABLE")
      }
      await sleep(retryAfterMilliseconds(response, attempt))
      continue
    }
    if (!response.ok) throw intervalsError("INTERVALS_UNAVAILABLE")

    try {
      return await response.json()
    } catch {
      throw intervalsError("INVALID_RESPONSE")
    }
  }
  throw intervalsError("INTERVALS_UNAVAILABLE")
}

export async function validateIntervalsApiKey(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<IntervalsAthlete> {
  const body = await fetchIntervalsJson(
    `${API_ROOT}/athlete/0`,
    apiKey,
    fetcher,
  )
  try {
    return parseIntervalsAthleteResponse(body)
  } catch {
    throw intervalsError("INVALID_RESPONSE")
  }
}

export function buildActivitiesUrl(
  athleteId: string,
  oldest: string,
  newest: string,
): string {
  const url = new URL(
    `${API_ROOT}/athlete/${encodeURIComponent(athleteId)}/activities`,
  )
  url.searchParams.set("oldest", oldest)
  url.searchParams.set("newest", newest)
  url.searchParams.set("fields", ACTIVITY_FIELDS.join(","))
  return url.toString()
}

export function buildEventsUrl(
  athleteId: string,
  oldest: string,
  newest: string,
): string {
  const url = new URL(
    `${API_ROOT}/athlete/${encodeURIComponent(athleteId)}/events`,
  )
  url.searchParams.set("oldest", oldest)
  url.searchParams.set("newest", newest)
  url.searchParams.set("category", EVENT_CATEGORIES.join(","))
  return url.toString()
}

async function fetchActivities(
  athleteId: string,
  apiKey: string,
  oldest: string,
  newest: string,
): Promise<IntervalsActivity[]> {
  const rows: IntervalsActivity[] = []
  for (const chunk of createInclusiveDateChunks(oldest, newest)) {
    const body = await fetchIntervalsJson(
      buildActivitiesUrl(athleteId, chunk.oldest, chunk.newest),
      apiKey,
    )
    try {
      rows.push(...parseIntervalsActivitiesResponse(body))
    } catch {
      throw intervalsError("INVALID_RESPONSE")
    }
  }
  return deduplicateBySourceId(rows, (row) => row.sourceActivityId)
}

async function fetchPlannedWorkouts(
  athleteId: string,
  apiKey: string,
  oldest: string,
  newest: string,
): Promise<IntervalsPlannedWorkout[]> {
  const rows: IntervalsPlannedWorkout[] = []
  for (const chunk of createInclusiveDateChunks(oldest, newest)) {
    const body = await fetchIntervalsJson(
      buildEventsUrl(athleteId, chunk.oldest, chunk.newest),
      apiKey,
    )
    try {
      rows.push(...parseIntervalsPlannedWorkoutsResponse(body))
    } catch {
      throw intervalsError("INVALID_RESPONSE")
    }
  }
  return deduplicateBySourceId(rows, (row) => row.sourceEventId)
}

export const validateAndEncrypt = internalAction({
  args: { apiKey: v.string() },
  handler: async (_ctx, { apiKey }) => {
    const athlete = await validateIntervalsApiKey(apiKey)
    const encrypted = encryptCredential(apiKey)
    return {
      ...athlete,
      encryptedApiKey: encrypted.ciphertext,
      encryptionIv: encrypted.encryptionIv,
      encryptionVersion: encrypted.encryptionVersion,
    }
  },
})

export const importIntervalsData = internalAction({
  args: {
    ownerTokenIdentifier: v.string(),
    connectionVersion: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let importRunId: Id<"intervalsImportRuns"> | undefined
    try {
      const connection: {
        athleteId: string
        encryptedApiKey: string
        encryptionIv: string
        encryptionVersion: "aes-256-gcm-v1"
      } | null = await ctx.runQuery(internal.intervals.getImportContext, args)
      if (!connection) return null
      const apiKey = decryptCredential({
        ciphertext: connection.encryptedApiKey,
        encryptionIv: connection.encryptionIv,
        encryptionVersion: connection.encryptionVersion,
      })
      const profileBody = await fetchIntervalsJson(
        `${API_ROOT}/athlete/0`,
        apiKey,
      )
      let profile: IntervalsProfile
      try {
        profile = parseIntervalsProfileResponse(profileBody)
      } catch {
        throw intervalsError("INVALID_RESPONSE")
      }
      if (profile.athleteId !== connection.athleteId) {
        throw intervalsError("INVALID_RESPONSE")
      }

      const now = Date.now()
      const window = rollingImportWindow(now, profile.timezone)
      const activityNewest = localDateForInstant(now, profile.timezone)
      importRunId =
        (await ctx.runMutation(internal.intervals.startImportRun, {
          ...args,
          profile,
          windowOldestLocalDate: window.oldest,
          windowNewestLocalDate: window.newest,
          activitiesThroughAt: now,
        })) ?? undefined
      if (!importRunId) throw intervalsError("STALE_IMPORT")

      const [activitiesResult, plannedWorkouts] = await Promise.all([
        fetchActivities(
          profile.athleteId,
          apiKey,
          window.oldest,
          activityNewest,
        ),
        fetchPlannedWorkouts(
          profile.athleteId,
          apiKey,
          window.oldest,
          window.newest,
        ),
      ])
      const activities = activitiesResult.filter((row) => row.startAt <= now)

      for (
        let index = 0;
        index < plannedWorkouts.length;
        index += IMPORT_BATCH_SIZE
      ) {
        const accepted: boolean = await ctx.runMutation(
          internal.intervals.writePlannedWorkoutBatch,
          {
            ...args,
            importRunId,
            rows: plannedWorkouts.slice(index, index + IMPORT_BATCH_SIZE),
          },
        )
        if (!accepted) throw intervalsError("STALE_IMPORT")
      }
      for (
        let index = 0;
        index < activities.length;
        index += IMPORT_BATCH_SIZE
      ) {
        const accepted: boolean = await ctx.runMutation(
          internal.intervals.writeActivityBatch,
          {
            ...args,
            importRunId,
            rows: activities.slice(index, index + IMPORT_BATCH_SIZE),
          },
        )
        if (!accepted) throw intervalsError("STALE_IMPORT")
      }
      const activated: boolean = await ctx.runMutation(
        internal.intervals.activateImportRun,
        {
          ...args,
          importRunId,
          profileCount: 1,
          plannedWorkoutCount: plannedWorkouts.length,
          activityCount: activities.length,
        },
      )
      if (!activated) throw intervalsError("STALE_IMPORT")
    } catch (error) {
      await ctx.runMutation(internal.intervals.recordImportFailure, {
        ...args,
        importRunId,
        errorCode: sanitizedErrorCode(error),
      })
    }
    return null
  },
})
