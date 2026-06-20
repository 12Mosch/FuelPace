// @vitest-environment jsdom

import { isRedirect } from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { IntervalsCardView, requireSettingsUser } from "./settings"

describe("settings route", () => {
  afterEach(cleanup)

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

  test("renders the disconnected integration state", () => {
    render(
      <IntervalsCardView
        connection={null}
        failure={null}
        isDisconnecting={false}
        onDisconnect={vi.fn()}
      />,
    )
    expect(screen.getByText("Not connected")).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: "Connect Intervals.icu" })
        .getAttribute("href"),
    ).toBe("/api/integrations/intervals/connect")
  })

  test("renders athlete identity in the connected state", () => {
    render(
      <IntervalsCardView
        connection={{
          athleteId: "12345",
          athleteName: "Ada Rider",
          grantedScopes: ["ACTIVITY:READ"],
          connectedAt: Date.UTC(2026, 0, 2),
          updatedAt: Date.UTC(2026, 0, 2),
        }}
        failure={null}
        isDisconnecting={false}
        onDisconnect={vi.fn()}
      />,
    )
    expect(screen.getAllByText("Connected")).toHaveLength(2)
    expect(screen.getByText("Ada Rider")).toBeTruthy()
    expect(screen.getByText("12345")).toBeTruthy()
    expect(
      (screen.getByRole("button", { name: "Disconnect" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })
})
