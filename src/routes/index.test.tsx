// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"
import { EmailReveal } from "./index"

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
