import { describe, expect, test } from "vitest"
import {
  baselineFluidsLitres,
  buildDailyHydrationPlan,
  calculateSweatRate,
  calculateSweatRateEstimate,
  DEFAULT_SWEAT_REPLACEMENT_FRACTION,
  deriveIntensityMetric,
  intensitySimilarityWeight,
  personalTestWeight,
  populationWeatherAdjustment,
  roundVolume,
  selectPersonalTests,
} from "./hydration"

const outdoorWeather = {
  apparentTemperatureC: 24,
  temperatureC: 22,
  relativeHumidityPercent: 55,
}

describe("hydration calculations", () => {
  test.each([
    ["female", 1.6],
    ["F", 1.6],
    ["male", 2],
    ["M", 2],
    [undefined, 1.8],
    ["unknown", 1.8],
  ])("selects the drinkable-fluid baseline for %s", (sex, expected) => {
    expect(baselineFluidsLitres(sex)).toBe(expected)
  })

  test("calculates and validates measured sweat rate", () => {
    expect(
      calculateSweatRate({
        preWeightKg: 70,
        postWeightKg: 69.4,
        consumedLitres: 0.5,
        urineLitres: 0.1,
        durationSeconds: 3600,
      }),
    ).toBeCloseTo(1)
    expect(
      calculateSweatRate({
        preWeightKg: 70,
        postWeightKg: 70,
        consumedLitres: 0,
        durationSeconds: 0,
      }),
    ).toBeNull()
    expect(
      calculateSweatRate({
        preWeightKg: 80,
        postWeightKg: 70,
        consumedLitres: 1,
        durationSeconds: 3600,
      }),
    ).toBeNull()
  })

  test("returns measurement bounds and corrects retained clothing water", () => {
    expect(
      calculateSweatRateEstimate({
        preWeightKg: 70,
        postWeightKg: 69.5,
        consumedLitres: 0.5,
        durationSeconds: 3600,
        scalePrecisionKg: 0.1,
        volumePrecisionLitres: 0.05,
        wetClothingAdjustmentKg: 0.2,
        wetClothingUncertaintyKg: 0.1,
      }),
    ).toEqual({
      rateLitresPerHour: 1.2,
      lowRateLitresPerHour: 0.975,
      highRateLitresPerHour: 1.425,
      correctedBodyMassChangePercent: 1,
    })
    expect(
      calculateSweatRateEstimate({
        preWeightKg: 70,
        postWeightKg: 65,
        consumedLitres: 0,
        durationSeconds: 3600,
      }),
    ).toBeNull()
    expect(
      calculateSweatRateEstimate({
        preWeightKg: 70,
        postWeightKg: 70,
        consumedLitres: 0.1,
        durationSeconds: 3600,
        scalePrecisionKg: 0.2,
      }),
    ).toBeNull()
  })

  test("counts workout drinking within the daily beverage target", () => {
    const plan = buildDailyHydrationPlan({
      sex: "female",
      weightKg: 60,
      sweatTests: [],
      workouts: [
        { id: "ride", sport: "Ride", durationSeconds: 3600, isIndoor: true },
        { id: "run", sport: "Run", durationSeconds: 1800, isIndoor: false },
      ],
    })
    expect(plan.baselineLitres).toBe(1.6)
    expect(DEFAULT_SWEAT_REPLACEMENT_FRACTION).toBe(0.7)
    expect(plan.replacementFraction).toBe(0.7)
    expect(plan.workoutReplacementLitres).toBeCloseTo(0.9639)
    expect(plan.targetType).toBe("total_beverages")
    expect(plan.targetLitres).toBe(1.6)
    expect(plan.additionalAboveBaselineLitres).toBe(0)
    expect(plan.displayTargetLitres).toBe(1.6)
    expect(plan.baselineConfidence).toBe("high")
    expect(plan.sweatRateConfidence).toBe("low")
    expect(plan.weatherAvailability).toBe("missing")
  })

  test("uses broad fallback without weight and reports the limitation", () => {
    const plan = buildDailyHydrationPlan({
      workouts: [{ id: "run", durationSeconds: 3600, sport: "Run" }],
      sweatTests: [],
    })
    expect(plan.workouts[0]?.sweatRateLitresPerHour).toBe(1.21)
    expect(plan.missingData.join(" ")).toMatch(/Body weight/)
  })

  test("adjusts outdoor population fallbacks for heat and humidity", () => {
    const workout = {
      id: "run",
      sport: "Run",
      durationSeconds: 3600,
      isIndoor: false,
    }
    const cool = buildDailyHydrationPlan({
      weightKg: 70,
      workouts: [
        {
          ...workout,
          weather: {
            apparentTemperatureC: 10,
            temperatureC: 12,
            relativeHumidityPercent: 40,
          },
        },
      ],
      sweatTests: [],
    })
    const hotHumid = buildDailyHydrationPlan({
      weightKg: 70,
      workouts: [
        {
          ...workout,
          weather: {
            apparentTemperatureC: 32,
            temperatureC: 29,
            relativeHumidityPercent: 80,
          },
        },
      ],
      sweatTests: [],
    })

    expect(cool.workouts[0]?.weatherAdjustmentFactor).toBeCloseTo(0.78)
    expect(hotHumid.workouts[0]?.weatherAdjustmentFactor).toBeCloseTo(1.3)
    expect(hotHumid.workouts[0]?.sweatRateLitresPerHour).toBeGreaterThan(
      cool.workouts[0]?.sweatRateLitresPerHour ?? Infinity,
    )
    expect(hotHumid.workouts[0]?.notes.join(" ")).toMatch(/adjusted \+30%/)
  })

  test("bounds weather adjustment and does not alter personal estimates", () => {
    expect(
      populationWeatherAdjustment({
        apparentTemperatureC: 60,
        temperatureC: 50,
        relativeHumidityPercent: 100,
      }),
    ).toBe(1.5)
    const plan = buildDailyHydrationPlan({
      workouts: [
        {
          id: "run",
          sport: "Run",
          durationSeconds: 3600,
          isIndoor: false,
          weather: {
            apparentTemperatureC: 40,
            temperatureC: 35,
            relativeHumidityPercent: 90,
          },
        },
      ],
      sweatTests: [
        {
          sweatRateLitresPerHour: 1,
          sport: "Run",
          isIndoor: false,
        },
      ],
    })

    expect(plan.workouts[0]?.source).toBe("personal")
    expect(plan.workouts[0]?.sweatRateLitresPerHour).toBe(1)
    expect(plan.workouts[0]?.weatherAdjustmentFactor).toBe(1)
  })

  test("gives high confidence to three close personal outdoor tests", () => {
    const workout = {
      id: "run",
      sport: "Run",
      durationSeconds: 7200,
      isIndoor: false,
      intensity: 70,
      weather: outdoorWeather,
    }
    const sweatTests = [0.9, 1.1, 1, 2].map((rate, index) => ({
      sweatRateLitresPerHour: rate,
      sport: index === 3 ? "Ride" : "TrailRun",
      isIndoor: false,
      intensity: 72,
      weather: outdoorWeather,
    }))
    const plan = buildDailyHydrationPlan({ workouts: [workout], sweatTests })
    expect(plan.workouts[0]).toMatchObject({
      source: "personal",
      sweatRateConfidence: "high",
      matchedTests: 3,
      sweatRateLitresPerHour: 1,
      replacementLitres: 1.4,
    })
    expect(plan.workouts[0]?.highRateLitresPerHour).toBeGreaterThanOrEqual(1.1)
  })

  test("uses limited personal data at medium confidence and separates indoor context", () => {
    const workout = {
      id: "ride",
      sport: "Ride",
      durationSeconds: 3600,
      isIndoor: true,
      intensity: 50,
    }
    const tests = [
      { sweatRateLitresPerHour: 0.8, sport: "Ride", isIndoor: true },
      { sweatRateLitresPerHour: 2, sport: "Ride", isIndoor: false },
    ]
    expect(selectPersonalTests(tests, workout)).toHaveLength(1)
    const estimate = buildDailyHydrationPlan({
      workouts: [workout],
      sweatTests: tests,
    }).workouts[0]
    expect(estimate).toMatchObject({
      sweatRateConfidence: "medium",
      source: "personal",
    })
    expect(estimate?.sweatRateLitresPerHour).toBeCloseTo(0.8)
    const plan = buildDailyHydrationPlan({
      workouts: [workout],
      sweatTests: tests,
    })
    expect(plan.weatherAvailability).toBe("not_applicable")
  })

  test("propagates personal-test measurement ranges", () => {
    const plan = buildDailyHydrationPlan({
      workouts: [
        { id: "ride", sport: "Ride", durationSeconds: 3600, isIndoor: true },
      ],
      sweatTests: [
        {
          sweatRateLitresPerHour: 1,
          lowSweatRateLitresPerHour: 0.8,
          highSweatRateLitresPerHour: 1.2,
          sport: "Ride",
          isIndoor: true,
        },
      ],
    })

    expect(plan.workouts[0]?.lowRateLitresPerHour).toBeCloseTo(0.8)
    expect(plan.workouts[0]?.highRateLitresPerHour).toBeCloseTo(1.2)
  })

  test("weights personal tests by recency and workout similarity", () => {
    const now = Date.UTC(2026, 5, 21)
    const workout = {
      id: "run",
      sport: "Run",
      durationSeconds: 3600,
      isIndoor: false,
      intensity: 70,
      weather: outdoorWeather,
    }
    const matching = {
      sweatRateLitresPerHour: 1,
      sport: "Run",
      isIndoor: false,
      activityStartAt: now,
      durationSeconds: 3600,
      intensity: 70,
      weather: outdoorWeather,
    }
    const matchingWeight = personalTestWeight(matching, workout, now)
    const variants = [
      { ...matching, activityStartAt: now - 365 * 86_400_000 },
      {
        ...matching,
        weather: { ...outdoorWeather, apparentTemperatureC: 34 },
      },
      {
        ...matching,
        weather: { ...outdoorWeather, relativeHumidityPercent: 85 },
      },
      { ...matching, intensity: 35 },
      { ...matching, durationSeconds: 10_800 },
      { ...matching, sport: "TrailRun" },
    ]

    expect(matchingWeight).toBe(0.75)
    for (const variant of variants) {
      expect(personalTestWeight(variant, workout, now)).toBeLessThan(
        matchingWeight,
      )
    }
    expect(
      personalTestWeight(
        {
          ...matching,
          lowSweatRateLitresPerHour: 0.5,
          highSweatRateLitresPerHour: 1.5,
        },
        workout,
        now,
      ),
    ).toBeLessThan(matchingWeight)
  })

  test("derives and compares sport-specific intensity metrics", () => {
    expect(
      deriveIntensityMetric({
        sport: "Ride",
        durationSeconds: 3600,
        workJoules: 720_000,
        intensity: 75,
      }),
    ).toEqual({ kind: "power_watts", value: 200 })
    expect(
      deriveIntensityMetric({
        sport: "Run",
        durationSeconds: 3000,
        distanceMetres: 10_000,
        intensity: 85,
      }),
    ).toEqual({ kind: "pace_seconds_per_kilometre", value: 300 })
    expect(deriveIntensityMetric({ sport: "Other", intensity: 80 })).toEqual({
      kind: "threshold_percent",
      value: 80,
    })
    expect(
      deriveIntensityMetric({ sport: "Other", averageHeartRate: 150 }),
    ).toEqual({ kind: "heart_rate_bpm", value: 150 })

    const closePower = intensitySimilarityWeight(
      { intensityMetric: { kind: "power_watts", value: 200 } },
      { intensityMetric: { kind: "power_watts", value: 220 } },
    )
    const distantPower = intensitySimilarityWeight(
      { intensityMetric: { kind: "power_watts", value: 200 } },
      { intensityMetric: { kind: "power_watts", value: 300 } },
    )
    expect(closePower).toBeGreaterThan(distantPower)
    expect(
      intensitySimilarityWeight(
        { intensityMetric: { kind: "power_watts", value: 200 } },
        {
          intensityMetric: {
            kind: "pace_seconds_per_kilometre",
            value: 300,
          },
        },
      ),
    ).toBe(0.6)
  })

  test("uses similarity weights instead of an unweighted median", () => {
    const now = Date.UTC(2026, 5, 21)
    const workout = {
      id: "run",
      sport: "Run",
      durationSeconds: 3600,
      isIndoor: false,
      intensity: 70,
      weather: outdoorWeather,
    }
    const plan = buildDailyHydrationPlan({
      workouts: [workout],
      referenceTime: now,
      sweatTests: [
        {
          sweatRateLitresPerHour: 1.2,
          sport: "Run",
          isIndoor: false,
          activityStartAt: now,
          durationSeconds: 3600,
          intensity: 70,
          weather: outdoorWeather,
        },
        {
          sweatRateLitresPerHour: 0.6,
          sport: "TrailRun",
          isIndoor: false,
          activityStartAt: now - 365 * 86_400_000,
          durationSeconds: 10_800,
          intensity: 35,
          weather: {
            apparentTemperatureC: 8,
            temperatureC: 10,
            relativeHumidityPercent: 90,
          },
        },
      ],
    })

    expect(plan.workouts[0]?.matchedTests).toBe(2)
    expect(plan.workouts[0]?.sweatRateLitresPerHour).toBeGreaterThan(1.1)
    expect(plan.workouts[0]?.sweatRateLitresPerHour).toBeLessThan(1.2)
  })

  test("uses a marked sport default when workout duration is missing", () => {
    const plan = buildDailyHydrationPlan({
      sex: "male",
      workouts: [
        {
          id: "missing",
          name: "Untimed ride",
          sport: "Ride",
          isIndoor: true,
        },
      ],
      sweatTests: [],
    })
    expect(plan.targetLitres).toBe(2)
    expect(plan.baselineConfidence).toBe("high")
    expect(plan.sweatRateConfidence).toBe("low")
    expect(plan.weatherAvailability).toBe("not_applicable")
    expect(plan.workouts[0]?.durationSource).toBe("sport_default")
    expect(plan.workouts[0]?.durationHours).toBe(1)
    expect(plan.workouts[0]?.lowDurationHours).toBe(0.75)
    expect(plan.workouts[0]?.highDurationHours).toBe(1.5)
    expect(plan.workouts[0]?.replacementLitres).toBeCloseTo(0.847)
    expect(plan.workouts[0]?.notes.join(" ")).toMatch(/duration is estimated/)
    expect(roundVolume(2.46)).toBe(2.5)
  })

  test("propagates an explicit duration range into volume bounds", () => {
    const plan = buildDailyHydrationPlan({
      workouts: [
        {
          id: "run",
          sport: "Run",
          durationRangeSeconds: { low: 1800, high: 3600 },
          isIndoor: true,
        },
      ],
      sweatTests: [{ sweatRateLitresPerHour: 1, sport: "Run", isIndoor: true }],
    })
    const workout = plan.workouts[0]

    expect(workout?.durationSource).toBe("estimated_range")
    expect(workout?.durationHours).toBe(0.75)
    expect(workout?.lowDurationHours).toBe(0.5)
    expect(workout?.highDurationHours).toBe(1)
    expect(workout?.lowReplacementLitres).toBeCloseTo(0.245)
    expect(workout?.highReplacementLitres).toBeCloseTo(0.91)
  })

  test("reports partial weather availability independently", () => {
    const plan = buildDailyHydrationPlan({
      workouts: [
        {
          id: "weather",
          durationSeconds: 3600,
          isIndoor: false,
          weather: outdoorWeather,
        },
        { id: "missing", durationSeconds: 3600, isIndoor: false },
      ],
      sweatTests: [],
    })

    expect(plan.sweatRateConfidence).toBe("low")
    expect(plan.weatherAvailability).toBe("partial")
  })

  test("supports a replacement fraction and caps it at estimated sweat loss", () => {
    const workout = {
      id: "ride",
      sport: "Ride",
      durationSeconds: 7200,
      isIndoor: true,
    }
    const sweatTests = [
      { sweatRateLitresPerHour: 1, sport: "Ride", isIndoor: true },
    ]

    const partial = buildDailyHydrationPlan({
      workouts: [workout],
      sweatTests,
      replacementFraction: 0.5,
    })
    const overConfigured = buildDailyHydrationPlan({
      workouts: [workout],
      sweatTests,
      replacementFraction: 1.5,
    })

    expect(partial.workoutReplacementLitres).toBe(1)
    expect(partial.replacementFraction).toBe(0.5)
    expect(overConfigured.workoutReplacementLitres).toBe(2)
    expect(overConfigured.replacementFraction).toBe(1)
    expect(
      overConfigured.workouts[0]?.highReplacementLitres,
    ).toBeLessThanOrEqual(
      (overConfigured.workouts[0]?.highRateLitresPerHour ?? 0) * 2,
    )
  })

  test("raises total beverages only when workout drinking exceeds baseline", () => {
    const plan = buildDailyHydrationPlan({
      sex: "female",
      workouts: [
        { id: "ride", sport: "Ride", durationSeconds: 10800, isIndoor: true },
      ],
      sweatTests: [
        { sweatRateLitresPerHour: 1, sport: "Ride", isIndoor: true },
      ],
    })

    expect(plan.workoutReplacementLitres).toBeCloseTo(2.1)
    expect(plan.targetLitres).toBeCloseTo(2.1)
    expect(plan.additionalAboveBaselineLitres).toBeCloseTo(0.5)
  })

  test("separates high sweat loss from constrained drinking and adds sodium guidance", () => {
    const plan = buildDailyHydrationPlan({
      workouts: [
        { id: "ride", sport: "Ride", durationSeconds: 7200, isIndoor: true },
      ],
      sweatTests: [
        {
          sweatRateLitresPerHour: 2,
          lowSweatRateLitresPerHour: 1.8,
          highSweatRateLitresPerHour: 2.2,
          sport: "Ride",
          isIndoor: true,
        },
      ],
    })
    const workout = plan.workouts[0]

    expect(workout?.estimatedSweatLossLitres).toBeCloseTo(4)
    expect(workout?.recommendedDrinkRateLitresPerHour).toBe(1)
    expect(workout?.recommendedDrinkLitres).toBe(2)
    expect(workout?.replacementLitres).toBe(2)
    expect(workout?.isHighSweatRate).toBe(true)
    expect(workout?.sodiumMilligramsPerLitreLow).toBe(500)
    expect(workout?.sodiumMilligramsPerLitreHigh).toBe(700)
    expect(workout?.notes.join(" ")).toMatch(/unusually high/)
    expect(workout?.notes.join(" ")).toMatch(/500–700 mg sodium\/L/)
  })

  test("recommends thirst under an hour and overdrinking guidance for longer sessions", () => {
    const plan = buildDailyHydrationPlan({
      workouts: [
        { id: "short", durationSeconds: 3599 },
        { id: "long", durationSeconds: 3600 },
      ],
      sweatTests: [],
    })
    expect(plan.workouts[0]?.guidance).toMatch(/thirst/)
    expect(plan.workouts[1]?.guidance).toMatch(/body-weight gain/)
    expect(plan.workouts[1]?.notes.join(" ")).toMatch(/sodium/)
  })
})
