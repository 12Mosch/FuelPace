import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { api } from "../../convex/_generated/api"
import {
  buildCalendarGrid,
  type CalendarEntry,
  type CalendarMonthData,
  currentIsoMonth,
  formatCalories,
  formatCarbohydrates,
  formatDistance,
  formatDuration,
  formatEnergy,
  formatHeartRate,
  formatIntensity,
  formatLoad,
  formatPower,
  groupCalendarEntries,
  isIsoMonth,
  mergeCalendarEntries,
  safeCalendarLocale,
  shiftIsoMonth,
} from "../lib/calendar"
import { requireRouteUser } from "../lib/route-auth"

export function normalizeCalendarSearch(search: Record<string, unknown>) {
  return { month: isIsoMonth(search.month) ? search.month : currentIsoMonth() }
}

export function requireCalendarUser(user: unknown) {
  requireRouteUser(user, "/calendar")
}

export const Route = createFileRoute("/calendar")({
  validateSearch: normalizeCalendarSearch,
  loaderDeps: ({ search }) => ({ month: search.month }),
  beforeLoad: ({ context }) => requireCalendarUser(context.user),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      convexQuery(api.intervals.getCalendarMonth, { month: deps.month }),
    ),
  head: () => ({ meta: [{ title: "Calendar | FuelPace" }] }),
  pendingComponent: CalendarLoading,
  errorComponent: CalendarError,
  component: CalendarPage,
})

function CalendarPage() {
  const { month } = Route.useSearch()
  const { data } = useSuspenseQuery(
    convexQuery(api.intervals.getCalendarMonth, { month }),
  )
  return <CalendarView data={data} month={month} />
}

function CalendarLoading() {
  return (
    <CalendarShell>
      <section className="calendar-state" aria-live="polite">
        <p className="section-kicker">Training journal</p>
        <h1>Loading calendar</h1>
        <p>Gathering your imported workouts and activities.</p>
      </section>
    </CalendarShell>
  )
}

function CalendarError() {
  const { month } = Route.useSearch()
  return (
    <CalendarShell>
      <section className="calendar-state" role="alert">
        <p className="section-kicker">Calendar unavailable</p>
        <h1>The month could not be loaded</h1>
        <p>Your connection has not been changed. Retry the calendar query.</p>
        <a
          className="journal-button journal-button-primary"
          href={`/calendar?month=${month}`}
        >
          Try again
        </a>
      </section>
    </CalendarShell>
  )
}

function CalendarShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="calendar-shell">
      <div className="calendar-grain" aria-hidden="true" />
      <header className="journal-header">
        <a className="journal-brand" href="/">
          FuelPace
        </a>
        <nav aria-label="Primary navigation">
          <a aria-current="page" href="/calendar">
            Calendar
          </a>
          <a href="/settings">Settings</a>
        </nav>
      </header>
      {children}
    </main>
  )
}

export function CalendarView({
  data,
  month,
  today = new Date(),
}: {
  data: CalendarMonthData
  month: string
  today?: Date
}) {
  const todayDate = `${String(today.getFullYear()).padStart(4, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const entries = useMemo(
    () =>
      data.state === "available"
        ? mergeCalendarEntries(data.plannedWorkouts, data.activities)
        : [],
    [data],
  )
  const grouped = useMemo(() => groupCalendarEntries(entries), [entries])
  const days = useMemo(
    () => buildCalendarGrid(month, grouped),
    [grouped, month],
  )
  const defaultDay = todayDate.startsWith(`${month}-`)
    ? todayDate
    : `${month}-01`
  const [selectedDay, setSelectedDay] = useState(defaultDay)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId)
  const monthLabel = new Intl.DateTimeFormat(
    data.state === "available" ? safeCalendarLocale(data.locale) : undefined,
    { month: "long", year: "numeric", timeZone: "UTC" },
  ).format(new Date(`${month}-01T00:00:00Z`))

  if (data.state === "disconnected") {
    return (
      <CalendarShellContent title={monthLabel} month={month}>
        <StateCard
          kicker="Intervals.icu disconnected"
          title="Connect your training history"
        >
          <p>Connect Intervals.icu before viewing imported workouts.</p>
          <a className="journal-button journal-button-primary" href="/settings">
            Open Settings
          </a>
        </StateCard>
      </CalendarShellContent>
    )
  }

  if (data.state === "awaiting_first_import") {
    return (
      <CalendarShellContent title={monthLabel} month={month}>
        <StateCard
          kicker="First import in progress"
          title="Building your training journal"
        >
          <p>
            FuelPace is importing the first snapshot. The calendar will appear
            once that snapshot is complete.
          </p>
        </StateCard>
      </CalendarShellContent>
    )
  }

  const selectedDayEntries = grouped.get(selectedDay) ?? []
  return (
    <CalendarShellContent title={monthLabel} month={month}>
      {data.syncStatus === "queued" || data.syncStatus === "importing" ? (
        <StatusNotice>
          A refresh is {data.syncStatus === "queued" ? "queued" : "running"}.
          The latest completed snapshot remains visible.
        </StatusNotice>
      ) : null}
      {data.syncStatus === "error" ? (
        <StatusNotice error>
          The latest refresh failed. Previously imported workouts remain
          available.
        </StatusNotice>
      ) : null}
      {data.truncated ? (
        <StatusNotice error>
          This month contains more than 500 imported entries. Showing the first
          500 in local-date order.
        </StatusNotice>
      ) : null}
      <fieldset className="calendar-legend">
        <legend className="visually-hidden">Calendar legend</legend>
        <span>
          <i className="legend-planned" /> Planned
        </span>
        <span>
          <i className="legend-completed" /> Completed
        </span>
        <span>
          <i className="legend-race" /> Race
        </span>
        <span className="calendar-timezone">Dates in {data.timezone}</span>
      </fieldset>
      {entries.length === 0 ? (
        <StateCard kicker="Clear roads" title="No workouts this month">
          <p>
            No planned workouts or completed activities were imported for{" "}
            {monthLabel}.
          </p>
        </StateCard>
      ) : (
        <div
          className={`calendar-workspace${selectedEntry ? " has-detail" : ""}`}
        >
          <section
            className="month-board"
            aria-label={`${monthLabel} calendar`}
          >
            <div className="weekday-row" aria-hidden="true">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="month-grid">
              {days.map((day) => (
                <div
                  className={`calendar-day${day.inMonth ? "" : " is-outside"}${day.date === todayDate ? " is-today" : ""}${day.date === selectedDay ? " is-selected" : ""}`}
                  key={day.date}
                >
                  <button
                    aria-label={`Select ${day.date}, ${day.entries.length} workouts`}
                    className="mobile-day-trigger"
                    onClick={() => setSelectedDay(day.date)}
                    type="button"
                  >
                    <span>{day.dayNumber}</span>
                    <span className="day-dots" aria-hidden="true">
                      {day.entries.slice(0, 3).map((entry) => (
                        <i
                          className={`dot-${entry.status}${entry.category.startsWith("race") ? " dot-race" : ""}`}
                          key={entry.id}
                        />
                      ))}
                    </span>
                  </button>
                  <span className="desktop-day-number">{day.dayNumber}</span>
                  <div className="desktop-day-entries">
                    {day.entries.map((entry) => (
                      <EntryButton
                        entry={entry}
                        key={entry.id}
                        onSelect={() => setSelectedEntryId(entry.id)}
                        selected={selectedEntryId === entry.id}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mobile-day-list" aria-live="polite">
              <p className="section-kicker">
                {formatLocalDate(selectedDay, data.locale)}
              </p>
              {selectedDayEntries.length === 0 ? (
                <p>No sessions on this day.</p>
              ) : (
                selectedDayEntries.map((entry) => (
                  <EntryButton
                    entry={entry}
                    key={entry.id}
                    onSelect={() => setSelectedEntryId(entry.id)}
                    selected={selectedEntryId === entry.id}
                  />
                ))
              )}
            </div>
          </section>
          {selectedEntry ? (
            <EntryDetail
              entry={selectedEntry}
              locale={data.locale}
              onClose={() => setSelectedEntryId(null)}
            />
          ) : null}
        </div>
      )}
    </CalendarShellContent>
  )
}

function CalendarShellContent({
  children,
  month,
  title,
}: {
  children: React.ReactNode
  month: string
  title: string
}) {
  return (
    <CalendarShell>
      <section className="calendar-heading">
        <div>
          <p className="section-kicker">Imported workouts</p>
          <h1>{title}</h1>
        </div>
        <nav className="month-controls" aria-label="Calendar month navigation">
          <a
            className="journal-button"
            href={`/calendar?month=${shiftIsoMonth(month, -1)}`}
          >
            Previous
          </a>
          <a
            className="journal-button"
            href={`/calendar?month=${currentIsoMonth()}`}
          >
            Today
          </a>
          <a
            className="journal-button"
            href={`/calendar?month=${shiftIsoMonth(month, 1)}`}
          >
            Next
          </a>
        </nav>
      </section>
      {children}
    </CalendarShell>
  )
}

function StateCard({
  children,
  kicker,
  title,
}: {
  children: React.ReactNode
  kicker: string
  title: string
}) {
  return (
    <section className="calendar-state">
      <p className="section-kicker">{kicker}</p>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function StatusNotice({
  children,
  error = false,
}: {
  children: React.ReactNode
  error?: boolean
}) {
  return (
    <div
      className={`calendar-notice${error ? " is-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  )
}

function EntryButton({
  entry,
  onSelect,
  selected,
}: {
  entry: CalendarEntry
  onSelect: () => void
  selected: boolean
}) {
  const race = entry.category.startsWith("race")
  return (
    <button
      aria-expanded={selected}
      className={`workout-chip is-${entry.status}${race ? " is-race" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span>{entry.name}</span>
      <small>{entry.sport || (race ? "Race" : entry.status)}</small>
    </button>
  )
}

function formatLocalDate(date: string, locale?: string) {
  return new Intl.DateTimeFormat(safeCalendarLocale(locale), {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`))
}

function EntryDetail({
  entry,
  locale,
  onClose,
}: {
  entry: CalendarEntry
  locale?: string
  onClose: () => void
}) {
  const planned = entry.planned
  const activity = entry.activity
  const metrics: Array<[string, string | undefined]> = [
    [
      "Planned duration",
      planned?.durationSeconds === undefined
        ? undefined
        : formatDuration(planned.durationSeconds, locale),
    ],
    [
      "Planned distance",
      planned?.distanceMetres === undefined
        ? undefined
        : formatDistance(planned.distanceMetres, locale),
    ],
    [
      "Planned load",
      planned?.trainingLoad === undefined
        ? undefined
        : formatLoad(planned.trainingLoad, locale),
    ],
    [
      "Planned intensity",
      planned?.intensity === undefined
        ? undefined
        : formatIntensity(planned.intensity, locale),
    ],
    [
      "Energy target",
      planned?.workJoules === undefined
        ? undefined
        : formatEnergy(planned.workJoules, locale),
    ],
    [
      "Carbohydrate use target",
      planned?.carbohydratesUsedGrams === undefined
        ? undefined
        : formatCarbohydrates(planned.carbohydratesUsedGrams, locale),
    ],
    [
      "Carbohydrate target",
      planned?.carbohydratesIntakeGrams === undefined
        ? undefined
        : formatCarbohydrates(planned.carbohydratesIntakeGrams, locale),
    ],
    [
      "Moving time",
      activity?.movingTimeSeconds === undefined
        ? undefined
        : formatDuration(activity.movingTimeSeconds, locale),
    ],
    [
      "Elapsed time",
      activity?.elapsedTimeSeconds === undefined
        ? undefined
        : formatDuration(activity.elapsedTimeSeconds, locale),
    ],
    [
      "Actual distance",
      activity?.distanceMetres === undefined
        ? undefined
        : formatDistance(activity.distanceMetres, locale),
    ],
    [
      "Calories",
      activity?.caloriesKilocalories === undefined
        ? undefined
        : formatCalories(activity.caloriesKilocalories, locale),
    ],
    [
      "Actual load",
      activity?.trainingLoad === undefined
        ? undefined
        : formatLoad(activity.trainingLoad, locale),
    ],
    [
      "Actual intensity",
      activity?.intensity === undefined
        ? undefined
        : formatIntensity(activity.intensity, locale),
    ],
    [
      "Actual work",
      activity?.workJoules === undefined
        ? undefined
        : formatEnergy(activity.workJoules, locale),
    ],
    [
      "Carbohydrate used",
      activity?.carbohydratesUsedGrams === undefined
        ? undefined
        : formatCarbohydrates(activity.carbohydratesUsedGrams, locale),
    ],
    [
      "Carbohydrate intake",
      activity?.carbohydratesIntakeGrams === undefined
        ? undefined
        : formatCarbohydrates(activity.carbohydratesIntakeGrams, locale),
    ],
    [
      "Average heart rate",
      activity?.averageHeartRate === undefined
        ? undefined
        : formatHeartRate(activity.averageHeartRate, locale),
    ],
    [
      "Maximum heart rate",
      activity?.maxHeartRate === undefined
        ? undefined
        : formatHeartRate(activity.maxHeartRate, locale),
    ],
    [
      "Average power",
      activity?.averagePowerWatts === undefined
        ? undefined
        : formatPower(activity.averagePowerWatts, locale),
    ],
    [
      "Weighted power",
      activity?.weightedAveragePowerWatts === undefined
        ? undefined
        : formatPower(activity.weightedAveragePowerWatts, locale),
    ],
  ]
  const indicators = [
    entry.sport,
    planned?.category.replace("_", " "),
    planned?.targetType,
    activity?.source,
    planned?.isIndoor || activity?.isIndoor ? "Indoor" : undefined,
    activity?.isCommute ? "Commute" : undefined,
    activity?.isManual ? "Manual" : undefined,
    activity?.isPrivate ? "Private" : undefined,
  ].filter(Boolean)
  const description = planned?.description || activity?.description
  return (
    <aside aria-labelledby="workout-detail-title" className="workout-detail">
      <button
        aria-label="Close workout details"
        className="detail-close"
        onClick={onClose}
        type="button"
      >
        Close
      </button>
      <p className="section-kicker">
        {entry.status}
        {entry.planned && entry.activity ? " · planned + actual" : ""}
      </p>
      <h2 id="workout-detail-title">{entry.name}</h2>
      <p className="detail-date">
        {formatLocalDate(entry.date, locale)}
        {activity ? ` · ${activity.localStartDateTime.slice(11, 16)}` : ""}
      </p>
      <div className="detail-tags">
        {indicators.map((indicator) => (
          <span key={indicator}>{indicator}</span>
        ))}
      </div>
      {metrics.some(([, value]) => value !== undefined) ? (
        <dl className="detail-metrics">
          {metrics.flatMap(([label, value]) =>
            value === undefined
              ? []
              : [
                  <div className="detail-metric" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>,
                ],
          )}
        </dl>
      ) : null}
      {description ? (
        <div className="detail-description">
          <h3>Description</h3>
          <p>{description}</p>
        </div>
      ) : null}
    </aside>
  )
}
