import { describe, expect, test } from "vitest"
import { parseIntervalsAthleteResponse } from "./intervals"

describe("Intervals athlete response", () => {
  test("parses and trims a valid athlete identity", () => {
    expect(
      parseIntervalsAthleteResponse({ id: " i123 ", name: " Ada Rider " }),
    ).toEqual({ athleteId: "i123", athleteName: "Ada Rider" })
  })

  test.each([
    null,
    {},
    { id: "", name: "Ada" },
    { id: "i123", name: " " },
    { id: 123, name: "Ada" },
    { id: "i123", name: null },
  ])("rejects a malformed athlete response %#", (response) => {
    expect(() => parseIntervalsAthleteResponse(response)).toThrow()
  })
})
