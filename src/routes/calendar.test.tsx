// @vitest-environment jsdom

import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  isRedirect,
  RouterContextProvider,
} from "@tanstack/react-router"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, test } from "vitest"
import {
  buildCalendarGrid,
  type CalendarMonthData,
  mergeCalendarEntries,
  shiftIsoMonth,
} from "../lib/calendar"
import {
  CalendarView,
  normalizeCalendarSearch,
  requireCalendarUser,
} from "./calendar"

const available: CalendarMonthData = {
  state: "available",
  syncStatus: "ready",
  lastSuccessfulSyncAt: 1,
  timezone: "Europe/Berlin",
  locale: "en-GB",
  importedWindow: {
    oldestLocalDate: "2026-01-01",
    newestLocalDate: "2026-12-31",
    activitiesThroughAt: 1,
  },
  plannedWorkouts: [],
  activities: [],
  truncated: false,
}

function renderWithRouter(children: ReactNode) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: createRootRoute(),
  })

  return render(
    <RouterContextProvider router={router}>{children}</RouterContextProvider>,
  )
}

describe("calendar helpers", () => {
  test("redirects unauthenticated visitors with the calendar return path", () => {
    try {
      requireCalendarUser(null)
      throw new Error("Expected redirect")
    } catch (error) {
      expect(isRedirect(error)).toBe(true)
      expect((error as { options: { href: string } }).options.href).toBe(
        "/api/auth/sign-in?returnPathname=/calendar",
      )
    }
  })

  test("normalizes invalid months and preserves valid months", () => {
    expect(normalizeCalendarSearch({ month: "2026-02" })).toEqual({
      month: "2026-02",
    })
    expect(normalizeCalendarSearch({ month: "2026-13" }).month).toMatch(
      /^\d{4}-\d{2}$/,
    )
  })

  test("shifts months across year boundaries", () => {
    expect(shiftIsoMonth("2026-01", -1)).toBe("2025-12")
    expect(shiftIsoMonth("2026-12", 1)).toBe("2027-01")
  })

  test("builds a Monday-first six-week grid across leap day", () => {
    const grid = buildCalendarGrid("2024-02")
    expect(grid).toHaveLength(42)
    expect(grid[0]?.date).toBe("2024-01-29")
    expect(grid.some((day) => day.date === "2024-02-29")).toBe(true)
    expect(grid[41]?.date).toBe("2024-03-10")
  })

  test("merges paired records once on the activity local date", () => {
    const entries = mergeCalendarEntries(
      [
        {
          sourceEventId: "event-1",
          category: "race_a",
          localStartDate: "2026-06-10",
          name: "Planned race",
          durationSeconds: 3600,
        },
        {
          sourceEventId: "event-2",
          category: "workout",
          localStartDate: "2026-06-20",
        },
      ],
      [
        {
          sourceActivityId: "activity-1",
          localStartDateTime: "2026-06-11T08:30:00",
          sport: "Ride",
          name: "Actual race",
          pairedEventId: "event-1",
          averagePowerWatts: 250,
        },
        {
          sourceActivityId: "activity-2",
          localStartDateTime: "2026-06-15T07:00:00",
          sport: "Run",
        },
      ],
    )
    expect(entries).toHaveLength(3)
    expect(
      entries.find((entry) => entry.id === "completed:activity-1"),
    ).toMatchObject({
      date: "2026-06-11",
      name: "Actual race",
      status: "completed",
      planned: { name: "Planned race" },
      activity: { averagePowerWatts: 250 },
    })
  })
})

describe("calendar view", () => {
  afterEach(cleanup)

  test.each([
    [
      {
        state: "disconnected",
        syncStatus: "never_synced",
        plannedWorkouts: [],
        activities: [],
        truncated: false,
      } as CalendarMonthData,
      "Connect your training history",
    ],
    [
      {
        state: "awaiting_first_import",
        syncStatus: "importing",
        plannedWorkouts: [],
        activities: [],
        truncated: false,
      } as CalendarMonthData,
      "Building your training journal",
    ],
    [available, "No workouts this month"],
  ])("renders a calendar data state", (data, heading) => {
    renderWithRouter(<CalendarView data={data} month="2026-06" />)
    expect(screen.getByText(heading)).toBeTruthy()
  })

  test("shows refresh and overflow notices while preserving entries", () => {
    renderWithRouter(
      <CalendarView
        data={{
          ...available,
          syncStatus: "error",
          lastSyncErrorCode: "INVALID_RESPONSE",
          truncated: true,
          plannedWorkouts: [
            {
              sourceEventId: "one",
              category: "workout",
              localStartDate: "2026-06-01",
              name: "Endurance ride",
            },
          ],
        }}
        month="2026-06"
      />,
    )
    expect(screen.getByText(/latest refresh failed/i)).toBeTruthy()
    expect(screen.getByText(/more than 500 imported entries/i)).toBeTruthy()
    expect(screen.getAllByText("Endurance ride").length).toBeGreaterThan(0)
  })

  test("opens and closes a merged workout detail and omits absent metrics", () => {
    renderWithRouter(
      <CalendarView
        data={{
          ...available,
          plannedWorkouts: [
            {
              sourceEventId: "one",
              category: "workout",
              localStartDate: "2026-06-03",
              name: "Tempo ride",
              durationSeconds: 3600,
              description: "Hold a steady tempo.",
            },
          ],
          activities: [
            {
              sourceActivityId: "done",
              localStartDateTime: "2026-06-03T07:30:00",
              sport: "Ride",
              pairedEventId: "one",
              averagePowerWatts: 240,
            },
          ],
        }}
        month="2026-06"
        today={new Date(2026, 5, 3)}
      />,
    )
    const triggers = screen.getAllByRole("button", { name: /Tempo ride/ })
    fireEvent.click(triggers[0] as HTMLElement)
    expect(screen.getByRole("heading", { name: "Tempo ride" })).toBeTruthy()
    expect(screen.getByText("1 h")).toBeTruthy()
    expect(screen.getByText("240 W")).toBeTruthy()
    expect(screen.queryByText("Maximum heart rate")).toBeNull()
    expect(triggers[0]?.getAttribute("aria-expanded")).toBe("true")
    fireEvent.click(
      screen.getByRole("button", { name: "Close workout details" }),
    )
    expect(screen.queryByRole("heading", { name: "Tempo ride" })).toBeNull()
  })

  test("selects a mobile-grid day and presents its workout list", () => {
    renderWithRouter(
      <CalendarView
        data={{
          ...available,
          activities: [
            {
              sourceActivityId: "run",
              localStartDateTime: "2026-06-08T06:00:00",
              sport: "Run",
              name: "Morning run",
            },
          ],
        }}
        month="2026-06"
      />,
    )
    fireEvent.click(
      screen.getByRole("button", { name: "Select 2026-06-08, 1 workouts" }),
    )
    expect(screen.getAllByText("Morning run")).toHaveLength(2)
  })
})
