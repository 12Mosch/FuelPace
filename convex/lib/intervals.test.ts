import { describe, expect, test } from "vitest"
import {
  createInclusiveDateChunks,
  deduplicateBySourceId,
  localDateForInstant,
  parseIntervalsActivitiesResponse,
  parseIntervalsActivityResponse,
  parseIntervalsAthleteResponse,
  parseIntervalsPlannedWorkoutResponse,
  parseIntervalsProfileResponse,
  rollingImportWindow,
} from "./intervals"

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

  test("normalizes nullable profile fields without retaining unknown data", () => {
    expect(
      parseIntervalsProfileResponse({
        id: "i123",
        name: " Ada ",
        timezone: "Europe/Berlin",
        locale: null,
        sex: " F ",
        icu_date_of_birth: "2000-02-29",
        weight: 61.5,
        units: "metric",
        api_key: "must-not-survive",
      }),
    ).toEqual({
      athleteId: "i123",
      athleteName: "Ada",
      timezone: "Europe/Berlin",
      sex: "F",
      birthDate: "2000-02-29",
      weightKg: 61.5,
      measurementPreference: "metric",
    })
  })

  test.each([
    { timezone: "Not/AZone" },
    { timezone: "UTC", weight: -1 },
    { timezone: "UTC", weight: "61" },
    { timezone: "UTC", icu_date_of_birth: "2001-02-29" },
  ])("rejects malformed profile fields %#", (fields) => {
    expect(() =>
      parseIntervalsProfileResponse({ id: "i1", name: "Ada", ...fields }),
    ).toThrow()
  })
})

describe("Intervals normalized training data", () => {
  test("normalizes planned workouts and event categories", () => {
    expect(
      parseIntervalsPlannedWorkoutResponse({
        id: 42,
        category: "RACE_A",
        start_date_local: "2026-06-20T08:00:00",
        end_date_local: null,
        type: " Ride ",
        name: " A race ",
        description: " ",
        moving_time: 3600,
        distance: 40_000,
        icu_joules: 720_000,
        carbs_used: 80,
        trainer: false,
        updated: "2026-06-19T12:00:00Z",
      }),
    ).toEqual({
      sourceEventId: "42",
      category: "race_a",
      sport: "Ride",
      localStartDate: "2026-06-20",
      localStartDateTime: "2026-06-20T08:00:00",
      localEndDate: undefined,
      name: "A race",
      description: undefined,
      durationSeconds: 3600,
      distanceMetres: 40_000,
      trainingLoad: undefined,
      intensity: undefined,
      workJoules: 720_000,
      carbohydratesUsedGrams: 80,
      carbohydratesIntakeGrams: undefined,
      isIndoor: false,
      targetType: undefined,
      sourceUpdatedAt: Date.parse("2026-06-19T12:00:00Z"),
    })
  })

  test("normalizes completed activity units and flags", () => {
    expect(
      parseIntervalsActivityResponse({
        id: "i99",
        start_date: "2026-06-20T06:00:00Z",
        start_date_local: "2026-06-20T08:00:00",
        type: "Ride",
        name: null,
        moving_time: 3600,
        elapsed_time: 3700,
        distance: 39_000,
        icu_distance: 40_000,
        calories: 700,
        icu_training_load: 70,
        icu_intensity: 75,
        icu_joules: 600_000,
        carbs_used: 120,
        carbs_ingested: 90,
        average_heartrate: 140,
        max_heartrate: 175,
        icu_average_watts: 180,
        icu_weighted_avg_watts: 210,
        source: "GARMIN_CONNECT",
        paired_event_id: 42,
        commute: false,
        trainer: true,
        manual: false,
        private: true,
        unknown_vendor_field: { ignored: true },
      }),
    ).toMatchObject({
      sourceActivityId: "i99",
      startAt: Date.parse("2026-06-20T06:00:00Z"),
      localStartDateTime: "2026-06-20T08:00:00",
      distanceMetres: 40_000,
      workJoules: 600_000,
      caloriesKilocalories: 700,
      carbohydratesUsedGrams: 120,
      carbohydratesIntakeGrams: 90,
      pairedEventId: "42",
      isIndoor: true,
      isPrivate: true,
    })
  })

  test.each([
    { moving_time: "3600" },
    { distance: Number.NaN },
    { calories: -1 },
    { trainer: 1 },
    { paired_event_id: {} },
  ])("rejects malformed optional activity fields %#", (field) => {
    expect(() =>
      parseIntervalsActivityResponse({
        id: "i1",
        start_date: "2026-06-20T06:00:00Z",
        start_date_local: "2026-06-20T08:00:00",
        type: "Ride",
        ...field,
      }),
    ).toThrow()
  })

  test("requires array responses and deduplicates chunk overlap by ID", () => {
    expect(() => parseIntervalsActivitiesResponse({})).toThrow()
    expect(
      deduplicateBySourceId(
        [
          { id: "a", value: 1 },
          { id: "b", value: 2 },
          { id: "a", value: 3 },
        ],
        (row) => row.id,
      ),
    ).toEqual([
      { id: "a", value: 3 },
      { id: "b", value: 2 },
    ])
  })
})

describe("Intervals date windows", () => {
  test("uses athlete-local dates across a daylight-saving transition", () => {
    expect(
      localDateForInstant(
        Date.parse("2025-03-09T04:30:00Z"),
        "America/New_York",
      ),
    ).toBe("2025-03-08")
    expect(
      localDateForInstant(
        Date.parse("2025-03-09T07:30:00Z"),
        "America/New_York",
      ),
    ).toBe("2025-03-09")
    expect(
      rollingImportWindow(
        Date.parse("2025-03-09T07:30:00Z"),
        "America/New_York",
      ),
    ).toEqual({ oldest: "2024-12-09", newest: "2025-04-08" })
  })

  test("creates bounded inclusive chunks with one-day boundary overlap", () => {
    expect(createInclusiveDateChunks("2026-01-01", "2026-02-15", 30)).toEqual([
      { oldest: "2026-01-01", newest: "2026-01-30" },
      { oldest: "2026-01-30", newest: "2026-02-15" },
    ])
  })
})
