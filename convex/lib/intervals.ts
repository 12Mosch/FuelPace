export type IntervalsAthlete = {
  athleteId: string
  athleteName: string
}

export type IntervalsProfile = IntervalsAthlete & {
  timezone: string
  locale?: string
  sex?: string
  birthDate?: string
  weightKg?: number
  measurementPreference?: string
}

export type PlannedWorkoutCategory = "workout" | "race_a" | "race_b" | "race_c"

export type IntervalsPlannedWorkout = {
  sourceEventId: string
  category: PlannedWorkoutCategory
  sport?: string
  localStartDate: string
  localEndDate?: string
  name?: string
  description?: string
  durationSeconds?: number
  distanceMetres?: number
  trainingLoad?: number
  intensity?: number
  workJoules?: number
  carbohydratesUsedGrams?: number
  carbohydratesIntakeGrams?: number
  isIndoor?: boolean
  targetType?: string
  sourceUpdatedAt?: number
}

export type IntervalsActivity = {
  sourceActivityId: string
  startAt: number
  localStartDateTime: string
  sport: string
  name?: string
  description?: string
  movingTimeSeconds?: number
  elapsedTimeSeconds?: number
  distanceMetres?: number
  caloriesKilocalories?: number
  trainingLoad?: number
  intensity?: number
  workJoules?: number
  carbohydratesUsedGrams?: number
  carbohydratesIntakeGrams?: number
  averageHeartRate?: number
  maxHeartRate?: number
  averagePowerWatts?: number
  weightedAveragePowerWatts?: number
  source?: string
  pairedEventId?: string
  isCommute?: boolean
  isIndoor?: boolean
  isManual?: boolean
  isPrivate?: boolean
}

export type DateChunk = { oldest: string; newest: string }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object")
  }
  return value as Record<string, unknown>
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}`)
  }
  return value.trim()
}

function optionalText(
  source: Record<string, unknown>,
  ...fields: string[]
): string | undefined {
  const field = fields.find((candidate) => source[candidate] !== undefined)
  if (!field || source[field] === null) return undefined
  if (typeof source[field] !== "string") throw new Error(`Invalid ${field}`)
  const result = source[field].trim()
  return result.length > 0 ? result : undefined
}

function optionalNumber(
  source: Record<string, unknown>,
  ...fields: string[]
): number | undefined {
  const field = fields.find((candidate) => source[candidate] !== undefined)
  if (!field || source[field] === null) return undefined
  const result = source[field]
  if (typeof result !== "number" || !Number.isFinite(result) || result < 0) {
    throw new Error(`Invalid ${field}`)
  }
  return result
}

function optionalBoolean(
  source: Record<string, unknown>,
  ...fields: string[]
): boolean | undefined {
  const field = fields.find((candidate) => source[candidate] !== undefined)
  if (!field || source[field] === null) return undefined
  if (typeof source[field] !== "boolean") throw new Error(`Invalid ${field}`)
  return source[field]
}

function sourceId(value: unknown, field: string): string {
  if (typeof value === "string") return requiredText(value, field)
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value)
  }
  throw new Error(`Invalid ${field}`)
}

function optionalSourceId(
  source: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = source[field]
  return value === undefined || value === null
    ? undefined
    : sourceId(value, field)
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const LOCAL_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/

function validDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function localDateTime(value: unknown, field: string): string {
  const result = requiredText(value, field)
  if (
    !LOCAL_DATE_TIME_PATTERN.test(result) ||
    !validDate(result.slice(0, 10))
  ) {
    throw new Error(`Invalid ${field}`)
  }
  return result
}

function optionalLocalDateTime(
  source: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = source[field]
  return value === undefined || value === null
    ? undefined
    : localDateTime(value, field)
}

function optionalInstant(
  source: Record<string, unknown>,
  ...fields: string[]
): number | undefined {
  const value = optionalText(source, ...fields)
  if (value === undefined) return undefined
  const result = Date.parse(value)
  if (!Number.isFinite(result)) throw new Error(`Invalid ${fields[0]}`)
  return result
}

export function parseIntervalsAthleteResponse(
  value: unknown,
): IntervalsAthlete {
  const response = object(value)
  return {
    athleteId: requiredText(response.id, "id"),
    athleteName: requiredText(response.name, "name"),
  }
}

export function parseIntervalsProfileResponse(
  value: unknown,
): IntervalsProfile {
  const response = object(value)
  const identity = parseIntervalsAthleteResponse(response)
  const timezone = requiredText(response.timezone, "timezone")
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0)
  } catch {
    throw new Error("Invalid timezone")
  }

  const birthDate = optionalText(response, "icu_date_of_birth", "birth_date")
  if (birthDate !== undefined && !validDate(birthDate)) {
    throw new Error("Invalid icu_date_of_birth")
  }

  return {
    ...identity,
    timezone,
    locale: optionalText(response, "locale"),
    sex: optionalText(response, "sex"),
    birthDate,
    weightKg: optionalNumber(response, "weight", "icu_weight"),
    measurementPreference: optionalText(
      response,
      "measurement_preference",
      "units",
    ),
  }
}

const CATEGORY_MAP: Record<string, PlannedWorkoutCategory> = {
  WORKOUT: "workout",
  RACE_A: "race_a",
  RACE_B: "race_b",
  RACE_C: "race_c",
}

export function parseIntervalsPlannedWorkoutResponse(
  value: unknown,
): IntervalsPlannedWorkout {
  const response = object(value)
  const sourceCategory = requiredText(response.category, "category")
  const category = CATEGORY_MAP[sourceCategory]
  if (!category) throw new Error("Invalid category")
  const start = localDateTime(response.start_date_local, "start_date_local")
  const end = optionalLocalDateTime(response, "end_date_local")

  return {
    sourceEventId: sourceId(response.id, "id"),
    category,
    sport: optionalText(response, "type"),
    localStartDate: start.slice(0, 10),
    localEndDate: end?.slice(0, 10),
    name: optionalText(response, "name"),
    description: optionalText(response, "description"),
    durationSeconds: optionalNumber(response, "moving_time"),
    distanceMetres: optionalNumber(response, "icu_distance", "distance"),
    trainingLoad: optionalNumber(response, "icu_training_load"),
    intensity: optionalNumber(response, "icu_intensity"),
    workJoules: optionalNumber(response, "icu_joules", "joules"),
    carbohydratesUsedGrams: optionalNumber(response, "carbs_used"),
    carbohydratesIntakeGrams: optionalNumber(
      response,
      "carbs_ingested",
      "carbs_intake",
    ),
    isIndoor: optionalBoolean(response, "indoor", "trainer"),
    targetType: optionalText(response, "target", "workout_target"),
    sourceUpdatedAt: optionalInstant(
      response,
      "updated",
      "updated_at",
      "last_modified",
    ),
  }
}

export function parseIntervalsActivityResponse(
  value: unknown,
): IntervalsActivity {
  const response = object(value)
  const startDate = requiredText(response.start_date, "start_date")
  const startAt = Date.parse(startDate)
  if (!Number.isFinite(startAt)) throw new Error("Invalid start_date")

  return {
    sourceActivityId: sourceId(response.id, "id"),
    startAt,
    localStartDateTime: localDateTime(
      response.start_date_local,
      "start_date_local",
    ),
    sport: requiredText(response.type, "type"),
    name: optionalText(response, "name"),
    description: optionalText(response, "description"),
    movingTimeSeconds: optionalNumber(response, "moving_time"),
    elapsedTimeSeconds: optionalNumber(response, "elapsed_time"),
    distanceMetres: optionalNumber(response, "icu_distance", "distance"),
    caloriesKilocalories: optionalNumber(response, "calories"),
    trainingLoad: optionalNumber(response, "icu_training_load"),
    intensity: optionalNumber(response, "icu_intensity"),
    workJoules: optionalNumber(response, "icu_joules", "joules"),
    carbohydratesUsedGrams: optionalNumber(response, "carbs_used"),
    carbohydratesIntakeGrams: optionalNumber(
      response,
      "carbs_ingested",
      "carbs_intake",
    ),
    averageHeartRate: optionalNumber(response, "average_heartrate"),
    maxHeartRate: optionalNumber(response, "max_heartrate"),
    averagePowerWatts: optionalNumber(
      response,
      "icu_average_watts",
      "average_watts",
    ),
    weightedAveragePowerWatts: optionalNumber(
      response,
      "icu_weighted_avg_watts",
      "icu_normalized_watts",
      "weighted_average_watts",
    ),
    source: optionalText(response, "source"),
    pairedEventId: optionalSourceId(response, "paired_event_id"),
    isCommute: optionalBoolean(response, "commute"),
    isIndoor: optionalBoolean(response, "trainer", "indoor"),
    isManual: optionalBoolean(response, "manual"),
    isPrivate: optionalBoolean(response, "private"),
  }
}

function parseArray<T>(value: unknown, parser: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error("Expected an array")
  return value.map(parser)
}

export function parseIntervalsPlannedWorkoutsResponse(value: unknown) {
  return parseArray(value, parseIntervalsPlannedWorkoutResponse)
}

export function parseIntervalsActivitiesResponse(value: unknown) {
  return parseArray(value, parseIntervalsActivityResponse)
}

export function deduplicateBySourceId<T>(
  rows: T[],
  getId: (row: T) => string,
): T[] {
  const deduplicated = new Map<string, T>()
  for (const row of rows) deduplicated.set(getId(row), row)
  return [...deduplicated.values()]
}

export function localDateForInstant(instant: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value
  const year = part("year")
  const month = part("month")
  const day = part("day")
  if (!year || !month || !day) throw new Error("Unable to format local date")
  return `${year}-${month}-${day}`
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  if (!validDate(localDate)) throw new Error("Invalid local date")
  const [year, month, day] = localDate.split("-").map(Number)
  const result = new Date(Date.UTC(year, month - 1, day + days))
  return result.toISOString().slice(0, 10)
}

export function rollingImportWindow(
  instant: number,
  timezone: string,
): { oldest: string; newest: string } {
  const today = localDateForInstant(instant, timezone)
  return {
    oldest: addDaysToLocalDate(today, -90),
    newest: addDaysToLocalDate(today, 30),
  }
}

export function createInclusiveDateChunks(
  oldest: string,
  newest: string,
  daysPerChunk = 30,
): DateChunk[] {
  if (!validDate(oldest) || !validDate(newest) || oldest > newest) {
    throw new Error("Invalid date window")
  }
  if (!Number.isInteger(daysPerChunk) || daysPerChunk < 2) {
    throw new Error("Invalid chunk size")
  }
  const chunks: DateChunk[] = []
  let start = oldest
  while (start <= newest) {
    const proposedEnd = addDaysToLocalDate(start, daysPerChunk - 1)
    const end = proposedEnd < newest ? proposedEnd : newest
    chunks.push({ oldest: start, newest: end })
    if (end === newest) break
    start = end
  }
  return chunks
}
