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
import {
  type Connection,
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
