import type { FunctionReturnType } from "convex/server"
import type { api } from "../../convex/_generated/api"

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type CalendarMonthData = FunctionReturnType<
  typeof api.intervals.getCalendarMonth
>
export type AvailableCalendarMonth = Extract<
  CalendarMonthData,
  { state: "available" }
>
export type PlannedWorkout = AvailableCalendarMonth["plannedWorkouts"][number]
export type CompletedActivity = AvailableCalendarMonth["activities"][number]

export type CalendarEntry = {
  id: string
  date: string
  status: "planned" | "completed"
  name: string
  category: PlannedWorkout["category"] | "activity"
  sport?: string
  planned?: PlannedWorkout
  activity?: CompletedActivity
}

export type CalendarDay = {
  date: string
  dayNumber: number
  inMonth: boolean
  entries: CalendarEntry[]
}

export function isIsoMonth(value: unknown): value is string {
  if (typeof value !== "string") return false
  const match = MONTH_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12
}

export function currentIsoMonth(now = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export function safeCalendarLocale(locale?: string): string | undefined {
  if (!locale) return undefined
  const candidate = locale.replaceAll("_", "-")
  try {
    return Intl.getCanonicalLocales(candidate)[0]
  } catch {
    return undefined
  }
}

export function shiftIsoMonth(month: string, offset: number): string {
  if (!isIsoMonth(month)) throw new Error("Invalid ISO month")
  const [year, monthNumber] = month.split("-").map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1))
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function buildCalendarGrid(
  month: string,
  grouped: Map<string, CalendarEntry[]> = new Map(),
): CalendarDay[] {
  if (!isIsoMonth(month)) throw new Error("Invalid ISO month")
  const [year, monthNumber] = month.split("-").map(Number)
  const first = new Date(Date.UTC(year, monthNumber - 1, 1))
  const mondayOffset = (first.getUTCDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setUTCDate(1 - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setUTCDate(gridStart.getUTCDate() + index)
    const value = isoDate(date)
    return {
      date: value,
      dayNumber: date.getUTCDate(),
      inMonth: date.getUTCMonth() === monthNumber - 1,
      entries: grouped.get(value) ?? [],
    }
  })
}

export function mergeCalendarEntries(
  plannedWorkouts: PlannedWorkout[],
  activities: CompletedActivity[],
): CalendarEntry[] {
  const plannedBySourceId = new Map(
    plannedWorkouts.map((planned) => [planned.sourceEventId, planned]),
  )
  const pairedIds = new Set<string>()
  const completed = activities.map((activity): CalendarEntry => {
    const planned = activity.pairedEventId
      ? plannedBySourceId.get(activity.pairedEventId)
      : undefined
    if (planned) pairedIds.add(planned.sourceEventId)
    return {
      id: `completed:${activity.sourceActivityId}`,
      date: activity.localStartDateTime.slice(0, 10),
      status: "completed",
      name: activity.name || planned?.name || "Completed activity",
      category: planned?.category ?? "activity",
      sport: activity.sport || planned?.sport,
      planned,
      activity,
    }
  })
  const planned = plannedWorkouts.flatMap((workout): CalendarEntry[] =>
    pairedIds.has(workout.sourceEventId)
      ? []
      : [
          {
            id: `planned:${workout.sourceEventId}`,
            date: workout.localStartDate,
            status: "planned",
            name: workout.name || "Planned workout",
            category: workout.category,
            sport: workout.sport,
            planned: workout,
          },
        ],
  )
  return [...planned, ...completed].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.name.localeCompare(right.name),
  )
}

export function groupCalendarEntries(entries: CalendarEntry[]) {
  const grouped = new Map<string, CalendarEntry[]>()
  for (const entry of entries) {
    if (!DATE_PATTERN.test(entry.date)) continue
    const existing = grouped.get(entry.date)
    if (existing) existing.push(entry)
    else grouped.set(entry.date, [entry])
  }
  return grouped
}

export function formatDuration(seconds: number, _locale?: string): string {
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
}

function number(value: number, locale?: string, digits = 0) {
  return new Intl.NumberFormat(safeCalendarLocale(locale), {
    maximumFractionDigits: digits,
  }).format(value)
}

export const formatDistance = (metres: number, locale?: string) =>
  `${number(metres / 1000, locale, 1)} km`
export const formatEnergy = (joules: number, locale?: string) =>
  `${number(joules / 1000, locale)} kJ`
export const formatCalories = (value: number, locale?: string) =>
  `${number(value, locale)} kcal`
export const formatLoad = (value: number, locale?: string) =>
  number(value, locale)
export const formatIntensity = (value: number, locale?: string) =>
  value <= 2 ? `${number(value * 100, locale)}%` : `${number(value, locale)}%`
export const formatPower = (value: number, locale?: string) =>
  `${number(value, locale)} W`
export const formatHeartRate = (value: number, locale?: string) =>
  `${number(value, locale)} bpm`
export const formatCarbohydrates = (value: number, locale?: string) =>
  `${number(value, locale)} g`
