// @vitest-environment jsdom

import { isRedirect } from "@tanstack/react-router"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { Id } from "../../convex/_generated/dataModel"
import {
  type Connection,
  HydrationSettingsView,
  IntervalsCardView,
  requireSettingsUser,
} from "./settings"

const connected = {
  athleteId: "12345",
  athleteName: "Ada Rider",
  connectedAt: Date.UTC(2026, 0, 2),
  updatedAt: Date.UTC(2026, 0, 2),
  syncStatus: "ready" as const,
  lastSuccessfulSyncAt: Date.UTC(2026, 0, 2),
  importedProfileCount: 1,
  importedPlannedWorkoutCount: 4,
  importedActivityCount: 12,
}

function renderCard(
  connection: Connection | null | undefined,
  onConnect = vi.fn().mockResolvedValue(undefined),
  onDisconnect = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <IntervalsCardView
      connection={connection}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
    />,
  )
  return { onConnect, onDisconnect }
}

describe("settings route", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test("redirects unauthenticated visitors to sign in", () => {
    try {
      requireSettingsUser(null)
      throw new Error("Expected redirect")
    } catch (error) {
      expect(isRedirect(error)).toBe(true)
      expect((error as { options: { href: string } }).options.href).toBe(
        "/api/auth/sign-in?returnPathname=/settings",
      )
      expect(
        (error as { options: { reloadDocument: boolean } }).options
          .reloadDocument,
      ).toBe(true)
    }
  })

  test("renders loading and disconnected states", () => {
    renderCard(undefined)
    expect(screen.getByText("Loading connection status...")).toBeTruthy()
    cleanup()

    renderCard(null)
    expect(screen.getByText("Not connected")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Connect Intervals.icu" }),
    ).toBeTruthy()
    expect(screen.getByLabelText("Intervals.icu API key")).toHaveProperty(
      "type",
      "password",
    )
    expect(screen.getByLabelText("Intervals.icu API key")).toHaveProperty(
      "autocomplete",
      "new-password",
    )
  })

  test("renders connected identity and replacement controls", () => {
    renderCard(connected)
    expect(screen.getByText("Up to date")).toBeTruthy()
    expect(screen.getByText("Ada Rider")).toBeTruthy()
    expect(screen.getByText("12345")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Replace API key" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy()
  })

  test.each([
    ["queued", "Refresh queued", "refresh is queued"],
    ["importing", "Importing", "Importing your latest"],
    ["never_synced", "Awaiting import", "not completed its first import"],
  ] as const)("renders the %s sync state", (syncStatus, label, detail) => {
    renderCard({
      ...connected,
      syncStatus,
      lastSuccessfulSyncAt:
        syncStatus === "never_synced"
          ? undefined
          : connected.lastSuccessfulSyncAt,
    })
    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByText(new RegExp(detail))).toBeTruthy()
  })

  test("explains that a failed refresh preserves existing data", () => {
    renderCard({
      ...connected,
      syncStatus: "error",
      lastSyncErrorCode: "INVALID_RESPONSE",
    })
    expect(screen.getByText("Refresh failed")).toBeTruthy()
    expect(
      screen.getByText(/previously imported data remains available/),
    ).toBeTruthy()
  })

  test("shows connecting state and clears the key after success", async () => {
    let resolveConnect: (() => void) | undefined
    const onConnect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConnect = resolve
        }),
    )
    renderCard(null, onConnect)
    const input = screen.getByLabelText(
      "Intervals.icu API key",
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: "secret-key" } })
    fireEvent.submit(input.closest("form") as HTMLFormElement)

    expect(
      screen.getByRole("button", { name: "Connecting..." }),
    ).toHaveProperty("disabled", true)
    expect(onConnect).toHaveBeenCalledWith("secret-key")
    resolveConnect?.()
    await waitFor(() => expect(input.value).toBe(""))
  })

  test.each([
    ["INVALID_API_KEY", "That API key is invalid"],
    ["INTERVALS_UNAVAILABLE", "Intervals.icu is temporarily unavailable"],
  ])("renders the %s validation error", async (code, message) => {
    const onConnect = vi.fn().mockRejectedValue({ data: { code } })
    renderCard(null, onConnect)
    const input = screen.getByLabelText("Intervals.icu API key")
    fireEvent.change(input, { target: { value: "bad-key" } })
    fireEvent.submit(input.closest("form") as HTMLFormElement)
    expect((await screen.findByRole("alert")).textContent).toContain(message)
  })

  test("renders disconnecting state after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true)
    let resolveDisconnect: (() => void) | undefined
    const onDisconnect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDisconnect = resolve
        }),
    )
    renderCard(connected, undefined, onDisconnect)
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }))
    expect(
      screen.getByRole("button", { name: "Disconnecting..." }),
    ).toHaveProperty("disabled", true)
    resolveDisconnect?.()
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy(),
    )
  })
})

describe("hydration settings", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  const activity = {
    sourceActivityId: "run-1",
    name: "Tempo run",
    localStartDateTime: "2026-06-19T08:00:00",
    startAt: Date.UTC(2026, 5, 19, 8),
    sport: "Run",
    durationSeconds: 3600,
    isIndoor: false,
  }

  function renderHydration(overrides: Record<string, unknown> = {}) {
    const props = {
      activities: [activity],
      location: null,
      tests: [],
      onSearch: vi.fn().mockResolvedValue([]),
      onSaveLocation: vi.fn().mockResolvedValue(undefined),
      onClearLocation: vi.fn().mockResolvedValue(undefined),
      onCreateTest: vi.fn().mockResolvedValue(undefined),
      onDeleteTest: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    }
    render(<HydrationSettingsView {...props} />)
    return props
  }

  test("searches and saves an Open-Meteo location result", async () => {
    const result = {
      id: 1,
      displayName: "Berlin, Germany",
      latitude: 52.52,
      longitude: 13.4,
      timezone: "Europe/Berlin",
    }
    const props = renderHydration({
      onSearch: vi.fn().mockResolvedValue([result]),
    })
    fireEvent.change(screen.getByLabelText("Search city or place"), {
      target: { value: "Berlin" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    fireEvent.click(
      await screen.findByRole("button", { name: /Berlin, Germany/ }),
    )
    await waitFor(() =>
      expect(props.onSaveLocation).toHaveBeenCalledWith({
        displayName: result.displayName,
        latitude: result.latitude,
        longitude: result.longitude,
        timezone: result.timezone,
      }),
    )
  })

  test("releases the location busy state when saving fails", async () => {
    const result = {
      id: 1,
      displayName: "Berlin, Germany",
      latitude: 52.52,
      longitude: 13.4,
      timezone: "Europe/Berlin",
    }
    const onSaveLocation = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue(undefined)
    renderHydration({
      onSearch: vi.fn().mockResolvedValue([result]),
      onSaveLocation,
    })
    fireEvent.change(screen.getByLabelText("Search city or place"), {
      target: { value: "Berlin" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    const locationButton = await screen.findByRole("button", {
      name: /Berlin, Germany/,
    })
    fireEvent.click(locationButton)

    expect((await screen.findByRole("status")).textContent).toContain(
      "The training location could not be saved",
    )
    await waitFor(() =>
      expect((locationButton as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(locationButton)
    await waitFor(() => expect(onSaveLocation).toHaveBeenCalledTimes(2))
  })

  test("converts US measurements before creating a sweat test", async () => {
    const props = renderHydration()
    fireEvent.change(screen.getByLabelText("Measurement units"), {
      target: { value: "us" },
    })
    fireEvent.change(screen.getByLabelText("Imported activity"), {
      target: { value: "run-1" },
    })
    fireEvent.change(screen.getByLabelText("Pre weight (lb)"), {
      target: { value: "154.324" },
    })
    fireEvent.change(screen.getByLabelText("Post weight (lb)"), {
      target: { value: "153.222" },
    })
    fireEvent.change(screen.getByLabelText("Consumed (fl oz)"), {
      target: { value: "16.907" },
    })
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Save sweat test" })
        .closest("form") as HTMLFormElement,
    )
    await waitFor(() => expect(props.onCreateTest).toHaveBeenCalled())
    const args = props.onCreateTest.mock.calls[0]?.[0]
    expect(args.preWeightKg).toBeCloseTo(70, 2)
    expect(args.postWeightKg).toBeCloseTo(69.5, 2)
    expect(args.consumedLitres).toBeCloseTo(0.5, 2)
    expect(args.scalePrecisionKg).toBeCloseTo(0.2 * 0.45359237)
    expect(args.volumePrecisionLitres).toBeCloseTo(0.0295735)
    expect(args.wetClothingAdjustmentKg).toBe(0)
    expect(args.wetClothingUncertaintyKg).toBe(0)
    expect(args.durationSeconds).toBe(3600)
  })

  test("renders calibrated history and an accessible delete control", () => {
    const id = "test-id" as Id<"hydrationSweatTests">
    renderHydration({
      tests: [
        {
          id,
          activityName: "Tempo run",
          activityStartAt: Date.now(),
          sweatRateLitresPerHour: 1.05,
          lowSweatRateLitresPerHour: 0.9,
          highSweatRateLitresPerHour: 1.2,
          sport: "Run",
          isIndoor: false,
          weather: { apparentTemperatureC: 22 },
        },
      ],
    })
    expect(screen.getByText("0.90–1.20 L/h")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Delete sweat test for Tempo run" }),
    ).toBeTruthy()
  })
})
