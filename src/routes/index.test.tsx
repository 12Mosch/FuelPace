// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"
import { EmailReveal, HydrationTargetView } from "./index"

describe("email reveal", () => {
  afterEach(cleanup)

  test("conceals the email until the user reveals it", () => {
    render(<EmailReveal email="rider@example.com" />)

    const reveal = screen.getByRole("button", {
      name: "Reveal email address",
    })
    expect(reveal.getAttribute("aria-expanded")).toBe("false")
    expect(reveal.classList.contains("is-visible")).toBe(false)
    expect(screen.getByRole("tooltip").textContent).toBe("Click to reveal")
    expect(screen.queryByText("rider@example.com")).toBeNull()

    fireEvent.click(reveal)

    const hide = screen.getByRole("button", { name: "Hide email address" })
    expect(hide.getAttribute("aria-expanded")).toBe("true")
    expect(hide.classList.contains("is-visible")).toBe(true)
    expect(screen.getByRole("tooltip").textContent).toBe("Click to hide")
    expect(screen.getByText("rider@example.com")).toBeTruthy()
  })
})

describe("hydration target", () => {
  afterEach(cleanup)

  test("renders target, uncertainty, breakdown, conditions, and safety guidance", () => {
    render(
      <HydrationTargetView
        plan={{
          targetType: "total_beverages",
          baselineLitres: 1.6,
          replacementFraction: 0.7,
          maxDrinkRateLitresPerHour: 1,
          workoutReplacementLitres: 1.2,
          additionalAboveBaselineLitres: 0,
          displayTargetLitres: 1.6,
          displayLowLitres: 1.6,
          displayHighLitres: 1.6,
          baselineConfidence: "high",
          sweatRateConfidence: "medium",
          weatherAvailability: "available",
          weatherStatus: "fresh",
          locationName: "Berlin, Germany",
          missingData: [],
          disclaimer: "Clinical guidance applies.",
          workouts: [
            {
              workoutId: "run",
              name: "Long run",
              durationHours: 1.5,
              lowDurationHours: 1,
              highDurationHours: 2,
              durationSource: "sport_default",
              replacementLitres: 1.2,
              sweatRateLitresPerHour: 0.8,
              estimatedSweatLossLitres: 1.2,
              recommendedDrinkRateLitresPerHour: 0.8,
              recommendedDrinkLitres: 1.2,
              isHighSweatRate: false,
              sweatRateConfidence: "medium",
              source: "personal",
              matchedTests: 2,
              weatherAdjustmentFactor: 1,
              guidance:
                "Pace fluids and avoid body-weight gain from overdrinking.",
              weather: {
                apparentTemperatureC: 22,
                relativeHumidityPercent: 60,
              },
              notes: [],
            },
          ],
        }}
      />,
    )
    expect(screen.getByRole("heading", { name: /1.6 L/ })).toBeTruthy()
    expect(screen.getByText(/Likely range 1.6–1.6 L/)).toBeTruthy()
    expect(screen.getAllByText("1.6 L")).toHaveLength(2)
    expect(screen.getByText(/Recommended workout drinking/)).toBeTruthy()
    expect(screen.getByText("1.2 L, included")).toBeTruthy()
    expect(screen.getByText(/1.2 L estimated/)).toBeTruthy()
    expect(screen.getByText(/Estimated sweat loss 1.2 L/)).toBeTruthy()
    expect(screen.getByText(/estimated 1.0–2.0 h/)).toBeTruthy()
    expect(screen.getByText(/not added again/)).toBeTruthy()
    expect(screen.getByText(/Berlin, Germany · fresh/)).toBeTruthy()
    expect(screen.getByText(/avoid body-weight gain/)).toBeTruthy()
    expect(screen.getByText("Baseline high")).toBeTruthy()
    expect(screen.getByText("Sweat rate medium")).toBeTruthy()
    expect(screen.getByText("Weather available")).toBeTruthy()
    expect(screen.getByText("Clinical guidance applies.")).toBeTruthy()
  })

  test("keeps a baseline target when no workout is available", () => {
    render(
      <HydrationTargetView
        plan={{
          targetType: "total_beverages",
          baselineLitres: 1.8,
          replacementFraction: 0.7,
          maxDrinkRateLitresPerHour: 1,
          workoutReplacementLitres: 0,
          additionalAboveBaselineLitres: 0,
          displayTargetLitres: 1.8,
          displayLowLitres: 1.8,
          displayHighLitres: 1.8,
          baselineConfidence: "high",
          sweatRateConfidence: "not_applicable",
          weatherAvailability: "not_applicable",
          weatherStatus: "missing",
          missingData: ["Connect Intervals.icu"],
          disclaimer: "Healthy adults only.",
          workouts: [],
        }}
      />,
    )
    expect(screen.getByText(/No timed workout/)).toBeTruthy()
    expect(screen.getByText("Baseline high")).toBeTruthy()
    expect(screen.getByText("Sweat rate not applicable")).toBeTruthy()
    expect(screen.getByText("Weather not applicable")).toBeTruthy()
    expect(screen.getByText("Connect Intervals.icu")).toBeTruthy()
  })
})
