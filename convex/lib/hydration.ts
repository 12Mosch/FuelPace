export type HydrationWeather = {
  apparentTemperatureC: number
  temperatureC: number
  relativeHumidityPercent: number
}

export type IntensityMetric = {
  kind:
    | "threshold_percent"
    | "power_watts"
    | "pace_seconds_per_kilometre"
    | "heart_rate_bpm"
  value: number
}

export type SweatTest = {
  sweatRateLitresPerHour: number
  lowSweatRateLitresPerHour?: number
  highSweatRateLitresPerHour?: number
  sport: string
  isIndoor: boolean
  activityStartAt?: number
  durationSeconds?: number
  intensity?: number
  intensityMetric?: IntensityMetric
  weather?: HydrationWeather
}

export type SweatRateEstimate = {
  rateLitresPerHour: number
  lowRateLitresPerHour: number
  highRateLitresPerHour: number
  correctedBodyMassChangePercent: number
}

export type HydrationWorkout = {
  id: string
  name?: string
  sport?: string
  durationSeconds?: number
  durationRangeSeconds?: { low: number; high: number }
  isIndoor?: boolean
  intensity?: number
  intensityMetric?: IntensityMetric
  weather?: HydrationWeather
  usedFallbackStartTime?: boolean
}

export type WorkoutHydrationEstimate = {
  workoutId: string
  name?: string
  durationHours: number
  lowDurationHours: number
  highDurationHours: number
  durationSource: "planned" | "estimated_range" | "sport_default"
  sweatRateLitresPerHour: number
  lowRateLitresPerHour: number
  highRateLitresPerHour: number
  estimatedSweatLossLitres: number
  lowEstimatedSweatLossLitres: number
  highEstimatedSweatLossLitres: number
  recommendedDrinkRateLitresPerHour: number
  lowRecommendedDrinkRateLitresPerHour: number
  highRecommendedDrinkRateLitresPerHour: number
  recommendedDrinkLitres: number
  replacementLitres: number
  lowReplacementLitres: number
  highReplacementLitres: number
  sweatRateConfidence: "high" | "medium" | "low"
  source: "personal" | "population"
  matchedTests: number
  weatherAdjustmentFactor: number
  weatherAvailability: "not_applicable" | "available" | "missing"
  isHighSweatRate: boolean
  sodiumMilligramsPerLitreLow?: number
  sodiumMilligramsPerLitreHigh?: number
  guidance: string
  weather?: HydrationWeather
  notes: string[]
}

export type DailyHydrationPlan = {
  targetType: "total_beverages"
  baselineLitres: number
  replacementFraction: number
  maxDrinkRateLitresPerHour: number
  workoutReplacementLitres: number
  additionalAboveBaselineLitres: number
  targetLitres: number
  lowLitres: number
  highLitres: number
  displayTargetLitres: number
  displayLowLitres: number
  displayHighLitres: number
  baselineConfidence: "high"
  sweatRateConfidence: "not_applicable" | "high" | "medium" | "low"
  weatherAvailability: "not_applicable" | "available" | "partial" | "missing"
  workouts: WorkoutHydrationEstimate[]
  missingData: string[]
}

const POPULATION_RATE_ML_PER_KG_HOUR = 15.3
const POPULATION_SPREAD_ML_PER_KG_HOUR = 6.8
const FALLBACK_RATE_LITRES_PER_HOUR = 1.21
const FALLBACK_SPREAD_LITRES_PER_HOUR = 0.68
const WEATHER_REFERENCE_APPARENT_TEMPERATURE_C = 20
const WEATHER_REFERENCE_HUMIDITY_PERCENT = 50
const WEATHER_TEMPERATURE_FACTOR_PER_C = 0.02
const WEATHER_HUMIDITY_FACTOR_PER_PERCENT = 0.002
const MIN_WEATHER_ADJUSTMENT_FACTOR = 0.7
const MAX_WEATHER_ADJUSTMENT_FACTOR = 1.5
const RECENCY_HALF_LIFE_DAYS = 180
const MIN_RECENCY_WEIGHT = 0.1
export const DEFAULT_SCALE_PRECISION_KG = 0.1
export const DEFAULT_VOLUME_PRECISION_LITRES = 0.05
export const DEFAULT_SWEAT_REPLACEMENT_FRACTION = 0.7
export const DEFAULT_MAX_DRINK_RATE_LITRES_PER_HOUR = 1
const HIGH_SWEAT_RATE_LITRES_PER_HOUR = 1.5
const SODIUM_GUIDANCE_SWEAT_RATE_LITRES_PER_HOUR = 0.8
const SODIUM_MILLIGRAMS_PER_LITRE_LOW = 500
const SODIUM_MILLIGRAMS_PER_LITRE_HIGH = 700
const SPORT_DURATION_DEFAULTS_SECONDS: Record<
  string,
  { low: number; typical: number; high: number }
> = {
  cycling: { low: 2700, typical: 3600, high: 5400 },
  running: { low: 1800, typical: 2700, high: 3600 },
  swimming: { low: 1800, typical: 2700, high: 3600 },
  walking: { low: 1800, typical: 3600, high: 5400 },
  skiing: { low: 2700, typical: 3600, high: 5400 },
  other: { low: 1800, typical: 2700, high: 3600 },
}

export function populationWeatherAdjustment(
  weather?: HydrationWeather,
): number {
  if (
    !weather ||
    !Number.isFinite(weather.apparentTemperatureC) ||
    !Number.isFinite(weather.relativeHumidityPercent)
  ) {
    return 1
  }
  const humidity = Math.min(100, Math.max(0, weather.relativeHumidityPercent))
  const factor =
    1 +
    (weather.apparentTemperatureC - WEATHER_REFERENCE_APPARENT_TEMPERATURE_C) *
      WEATHER_TEMPERATURE_FACTOR_PER_C +
    (humidity - WEATHER_REFERENCE_HUMIDITY_PERCENT) *
      WEATHER_HUMIDITY_FACTOR_PER_PERCENT
  return Math.min(
    MAX_WEATHER_ADJUSTMENT_FACTOR,
    Math.max(MIN_WEATHER_ADJUSTMENT_FACTOR, factor),
  )
}

function replacementVolume(
  estimatedSweatLossLitres: number,
  replacementFraction: number,
): number {
  const configuredReplacement =
    estimatedSweatLossLitres *
    (Number.isFinite(replacementFraction)
      ? Math.max(0, replacementFraction)
      : DEFAULT_SWEAT_REPLACEMENT_FRACTION)
  return Math.min(configuredReplacement, estimatedSweatLossLitres)
}

function recommendedDrinkRate(
  sweatRateLitresPerHour: number,
  replacementFraction: number,
  maxDrinkRateLitresPerHour: number,
): number {
  const configuredRate = replacementVolume(
    sweatRateLitresPerHour,
    replacementFraction,
  )
  return Math.min(configuredRate, maxDrinkRateLitresPerHour)
}

export function baselineFluidsLitres(sex?: string): number {
  const normalized = sex?.trim().toLowerCase()
  if (normalized === "female" || normalized === "f") return 1.6
  if (normalized === "male" || normalized === "m") return 2
  return 1.8
}

export function calculateSweatRateEstimate(args: {
  preWeightKg: number
  postWeightKg: number
  consumedLitres: number
  urineLitres?: number
  durationSeconds: number
  scalePrecisionKg?: number
  volumePrecisionLitres?: number
  wetClothingAdjustmentKg?: number
  wetClothingUncertaintyKg?: number
}): SweatRateEstimate | null {
  const values = [
    args.preWeightKg,
    args.postWeightKg,
    args.consumedLitres,
    args.urineLitres ?? 0,
    args.durationSeconds,
  ]
  if (
    values.some((value) => !Number.isFinite(value)) ||
    args.preWeightKg <= 0 ||
    args.postWeightKg <= 0 ||
    args.consumedLitres < 0 ||
    (args.urineLitres ?? 0) < 0 ||
    args.durationSeconds <= 0
  ) {
    return null
  }
  const scalePrecisionKg = args.scalePrecisionKg ?? DEFAULT_SCALE_PRECISION_KG
  const volumePrecisionLitres =
    args.volumePrecisionLitres ?? DEFAULT_VOLUME_PRECISION_LITRES
  const wetClothingAdjustmentKg = args.wetClothingAdjustmentKg ?? 0
  const wetClothingUncertaintyKg =
    args.wetClothingUncertaintyKg ?? wetClothingAdjustmentKg * 0.5
  if (
    !Number.isFinite(scalePrecisionKg) ||
    scalePrecisionKg <= 0 ||
    scalePrecisionKg > 1 ||
    !Number.isFinite(volumePrecisionLitres) ||
    volumePrecisionLitres < 0 ||
    volumePrecisionLitres > 1 ||
    !Number.isFinite(wetClothingAdjustmentKg) ||
    wetClothingAdjustmentKg < 0 ||
    wetClothingAdjustmentKg > 2 ||
    !Number.isFinite(wetClothingUncertaintyKg) ||
    wetClothingUncertaintyKg < 0 ||
    wetClothingUncertaintyKg > 2
  ) {
    return null
  }
  const durationHours = args.durationSeconds / 3600
  const correctedBodyMassLossKg =
    args.preWeightKg - args.postWeightKg + wetClothingAdjustmentKg
  const correctedBodyMassChangePercent =
    (correctedBodyMassLossKg / args.preWeightKg) * 100
  if (
    correctedBodyMassChangePercent < -2 ||
    correctedBodyMassChangePercent > 5
  ) {
    return null
  }
  const sweatLossLitres =
    correctedBodyMassLossKg + args.consumedLitres - (args.urineLitres ?? 0)
  const fluidMeasurements = args.urineLitres === undefined ? 1 : 2
  const uncertaintyLitres =
    scalePrecisionKg +
    (volumePrecisionLitres / 2) * fluidMeasurements +
    wetClothingUncertaintyKg
  const lowSweatLossLitres = sweatLossLitres - uncertaintyLitres
  const highSweatLossLitres = sweatLossLitres + uncertaintyLitres
  const rateLitresPerHour = sweatLossLitres / durationHours
  const lowRateLitresPerHour = lowSweatLossLitres / durationHours
  const highRateLitresPerHour = highSweatLossLitres / durationHours
  if (
    lowRateLitresPerHour < 0.1 ||
    rateLitresPerHour < 0.1 ||
    rateLitresPerHour > 6 ||
    highRateLitresPerHour > 6
  ) {
    return null
  }
  return {
    rateLitresPerHour,
    lowRateLitresPerHour,
    highRateLitresPerHour,
    correctedBodyMassChangePercent,
  }
}

export function calculateSweatRate(args: {
  preWeightKg: number
  postWeightKg: number
  consumedLitres: number
  urineLitres?: number
  durationSeconds: number
  scalePrecisionKg?: number
  volumePrecisionLitres?: number
  wetClothingAdjustmentKg?: number
  wetClothingUncertaintyKg?: number
}): number | null {
  return calculateSweatRateEstimate(args)?.rateLitresPerHour ?? null
}

export function sportFamily(sport?: string): string {
  const value = sport?.trim().toLowerCase() ?? ""
  if (/(ride|cycling|bike|virtualride)/.test(value)) return "cycling"
  if (/(run|jog|trail)/.test(value)) return "running"
  if (/(swim)/.test(value)) return "swimming"
  if (/(walk|hike)/.test(value)) return "walking"
  if (/(ski|snow)/.test(value)) return "skiing"
  return value || "other"
}

export function workoutDurationEstimate(workout: HydrationWorkout): {
  durationHours: number
  lowDurationHours: number
  highDurationHours: number
  source: WorkoutHydrationEstimate["durationSource"]
} {
  if (
    workout.durationSeconds !== undefined &&
    Number.isFinite(workout.durationSeconds) &&
    workout.durationSeconds > 0
  ) {
    const durationHours = workout.durationSeconds / 3600
    return {
      durationHours,
      lowDurationHours: durationHours,
      highDurationHours: durationHours,
      source: "planned",
    }
  }
  const range = workout.durationRangeSeconds
  if (
    range &&
    Number.isFinite(range.low) &&
    Number.isFinite(range.high) &&
    range.low > 0 &&
    range.high >= range.low
  ) {
    return {
      durationHours: (range.low + range.high) / 2 / 3600,
      lowDurationHours: range.low / 3600,
      highDurationHours: range.high / 3600,
      source: "estimated_range",
    }
  }
  const defaults =
    SPORT_DURATION_DEFAULTS_SECONDS[sportFamily(workout.sport)] ??
    SPORT_DURATION_DEFAULTS_SECONDS.other
  return {
    durationHours: defaults.typical / 3600,
    lowDurationHours: defaults.low / 3600,
    highDurationHours: defaults.high / 3600,
    source: "sport_default",
  }
}

function similarityWeight(
  first: number | undefined,
  second: number | undefined,
  scale: number,
  missingWeight: number,
): number {
  if (
    first === undefined ||
    second === undefined ||
    !Number.isFinite(first) ||
    !Number.isFinite(second)
  ) {
    return missingWeight
  }
  return 1 / (1 + Math.abs(first - second) / scale)
}

function positiveFinite(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

export function deriveIntensityMetric(args: {
  sport?: string
  intensity?: number
  durationSeconds?: number
  distanceMetres?: number
  workJoules?: number
  averageHeartRate?: number
  averagePowerWatts?: number
  weightedAveragePowerWatts?: number
}): IntensityMetric | undefined {
  const family = sportFamily(args.sport)
  const duration = positiveFinite(args.durationSeconds)
  if (family === "cycling") {
    const power =
      positiveFinite(args.weightedAveragePowerWatts) ??
      positiveFinite(args.averagePowerWatts) ??
      (duration !== undefined && positiveFinite(args.workJoules) !== undefined
        ? (args.workJoules ?? 0) / duration
        : undefined)
    if (power !== undefined) return { kind: "power_watts", value: power }
  }
  if (family === "running" || family === "walking" || family === "swimming") {
    const distance = positiveFinite(args.distanceMetres)
    if (distance !== undefined && duration !== undefined) {
      return {
        kind: "pace_seconds_per_kilometre",
        value: (duration * 1000) / distance,
      }
    }
  }
  const thresholdPercent = positiveFinite(args.intensity)
  if (thresholdPercent !== undefined) {
    return { kind: "threshold_percent", value: thresholdPercent }
  }
  const heartRate = positiveFinite(args.averageHeartRate)
  return heartRate === undefined
    ? undefined
    : { kind: "heart_rate_bpm", value: heartRate }
}

function resolvedIntensityMetric(
  metric: IntensityMetric | undefined,
  legacyIntensity: number | undefined,
): IntensityMetric | undefined {
  if (metric && positiveFinite(metric.value) !== undefined) return metric
  const value = positiveFinite(legacyIntensity)
  return value === undefined ? undefined : { kind: "threshold_percent", value }
}

export function intensitySimilarityWeight(
  test: Pick<SweatTest, "intensity" | "intensityMetric">,
  workout: Pick<HydrationWorkout, "intensity" | "intensityMetric">,
): number {
  const testMetric = resolvedIntensityMetric(
    test.intensityMetric,
    test.intensity,
  )
  const workoutMetric = resolvedIntensityMetric(
    workout.intensityMetric,
    workout.intensity,
  )
  if (!testMetric || !workoutMetric) return 0.75
  if (testMetric.kind !== workoutMetric.kind) {
    const legacyTestIntensity = positiveFinite(test.intensity)
    const legacyWorkoutIntensity = positiveFinite(workout.intensity)
    return legacyTestIntensity !== undefined &&
      legacyWorkoutIntensity !== undefined
      ? similarityWeight(legacyTestIntensity, legacyWorkoutIntensity, 10, 0.75)
      : 0.6
  }
  if (testMetric.kind === "threshold_percent") {
    return similarityWeight(testMetric.value, workoutMetric.value, 10, 0.75)
  }
  const tolerance =
    testMetric.kind === "pace_seconds_per_kilometre" ? 0.1 : 0.15
  return (
    1 /
    (1 +
      Math.abs(Math.log(testMetric.value / workoutMetric.value)) /
        Math.log(1 + tolerance))
  )
}

export function personalTestWeight(
  test: SweatTest,
  workout: HydrationWorkout,
  referenceTime = Date.now(),
): number {
  const ageDays =
    test.activityStartAt === undefined ||
    !Number.isFinite(test.activityStartAt) ||
    !Number.isFinite(referenceTime)
      ? undefined
      : Math.max(0, referenceTime - test.activityStartAt) / 86_400_000
  const recencyWeight =
    ageDays === undefined
      ? 0.75
      : Math.max(MIN_RECENCY_WEIGHT, 2 ** (-ageDays / RECENCY_HALF_LIFE_DAYS))
  const sportWeight =
    test.sport.trim().toLowerCase() === workout.sport?.trim().toLowerCase()
      ? 1
      : 0.9
  const temperatureWeight =
    workout.isIndoor === true
      ? 1
      : similarityWeight(
          test.weather?.apparentTemperatureC,
          workout.weather?.apparentTemperatureC,
          5,
          0.6,
        )
  const humidityWeight =
    workout.isIndoor === true
      ? 1
      : similarityWeight(
          test.weather?.relativeHumidityPercent,
          workout.weather?.relativeHumidityPercent,
          15,
          0.6,
        )
  const intensityWeight = intensitySimilarityWeight(test, workout)
  const durationWeight =
    test.durationSeconds !== undefined &&
    workout.durationSeconds !== undefined &&
    Number.isFinite(test.durationSeconds) &&
    Number.isFinite(workout.durationSeconds) &&
    test.durationSeconds > 0 &&
    workout.durationSeconds > 0
      ? Math.max(
          0.1,
          1 /
            (1 +
              Math.abs(
                Math.log(test.durationSeconds / workout.durationSeconds),
              )),
        )
      : 0.75
  const measurementWeight =
    test.lowSweatRateLitresPerHour !== undefined &&
    test.highSweatRateLitresPerHour !== undefined &&
    test.lowSweatRateLitresPerHour >= 0 &&
    test.highSweatRateLitresPerHour >= test.lowSweatRateLitresPerHour
      ? 1 /
        (1 +
          (test.highSweatRateLitresPerHour - test.lowSweatRateLitresPerHour) /
            2 /
            test.sweatRateLitresPerHour /
            0.15)
      : 0.75
  return (
    recencyWeight *
    sportWeight *
    temperatureWeight *
    humidityWeight *
    intensityWeight *
    durationWeight *
    measurementWeight
  )
}

export function selectPersonalTests(
  tests: SweatTest[],
  workout: HydrationWorkout,
  referenceTime = Date.now(),
): SweatTest[] {
  const family = sportFamily(workout.sport)
  const indoor = workout.isIndoor === true
  return tests
    .filter(
      (test) =>
        Number.isFinite(test.sweatRateLitresPerHour) &&
        test.sweatRateLitresPerHour >= 0.1 &&
        test.sweatRateLitresPerHour <= 6 &&
        sportFamily(test.sport) === family &&
        test.isIndoor === indoor,
    )
    .sort(
      (a, b) =>
        personalTestWeight(b, workout, referenceTime) -
        personalTestWeight(a, workout, referenceTime),
    )
    .slice(0, 5)
}

function estimateWorkout(
  workout: HydrationWorkout,
  tests: SweatTest[],
  replacementFraction: number,
  maxDrinkRateLitresPerHour: number,
  referenceTime: number,
  weightKg?: number,
): WorkoutHydrationEstimate {
  const duration = workoutDurationEstimate(workout)
  const workoutWithDuration = {
    ...workout,
    durationSeconds: duration.durationHours * 3600,
  }
  const selected = selectPersonalTests(
    tests,
    workoutWithDuration,
    referenceTime,
  )
  let rate: number
  let lowRate: number
  let highRate: number
  let sweatRateConfidence: WorkoutHydrationEstimate["sweatRateConfidence"]
  let source: WorkoutHydrationEstimate["source"]
  let weatherAdjustmentFactor = 1

  if (selected.length > 0) {
    const observations = selected.map((test) => ({
      rate: test.sweatRateLitresPerHour,
      lowRate:
        test.lowSweatRateLitresPerHour ?? test.sweatRateLitresPerHour * 0.7,
      highRate:
        test.highSweatRateLitresPerHour ?? test.sweatRateLitresPerHour * 1.3,
      weight: personalTestWeight(test, workoutWithDuration, referenceTime),
    }))
    const totalWeight = observations.reduce(
      (sum, observation) => sum + observation.weight,
      0,
    )
    rate =
      observations.reduce(
        (sum, observation) => sum + observation.rate * observation.weight,
        0,
      ) / totalWeight
    const variance =
      observations.reduce(
        (sum, observation) =>
          sum + observation.weight * (observation.rate - rate) ** 2,
        0,
      ) / totalWeight
    const weightedLowRate =
      observations.reduce(
        (sum, observation) => sum + observation.lowRate * observation.weight,
        0,
      ) / totalWeight
    const weightedHighRate =
      observations.reduce(
        (sum, observation) => sum + observation.highRate * observation.weight,
        0,
      ) / totalWeight
    const populationSpread = Math.sqrt(variance)
    const minimumSpread = rate * 0.1
    lowRate = Math.max(
      0.1,
      Math.min(weightedLowRate, rate - populationSpread, rate - minimumSpread),
    )
    highRate = Math.max(
      weightedHighRate,
      rate + populationSpread,
      rate + minimumSpread,
    )
    const squaredWeightSum = observations.reduce(
      (sum, observation) => sum + observation.weight ** 2,
      0,
    )
    const effectiveSampleSize = totalWeight ** 2 / squaredWeightSum
    const averageWeight = totalWeight / selected.length
    sweatRateConfidence =
      selected.length >= 3 &&
      effectiveSampleSize >= 2.5 &&
      averageWeight >= 0.2 &&
      !workout.usedFallbackStartTime
        ? "high"
        : "medium"
    source = "personal"
  } else {
    const baseRate =
      weightKg !== undefined
        ? (POPULATION_RATE_ML_PER_KG_HOUR * weightKg) / 1000
        : FALLBACK_RATE_LITRES_PER_HOUR
    const baseSpread =
      weightKg !== undefined
        ? (POPULATION_SPREAD_ML_PER_KG_HOUR * weightKg) / 1000
        : FALLBACK_SPREAD_LITRES_PER_HOUR
    weatherAdjustmentFactor =
      workout.isIndoor === true
        ? 1
        : populationWeatherAdjustment(workout.weather)
    rate = baseRate * weatherAdjustmentFactor
    const spread = baseSpread * weatherAdjustmentFactor
    lowRate = Math.max(0.1, rate - spread)
    highRate = rate + spread
    sweatRateConfidence = "low"
    source = "population"
  }

  const durationHours = duration.durationHours
  const estimatedSweatLossLitres = rate * durationHours
  const lowEstimatedSweatLossLitres = lowRate * duration.lowDurationHours
  const highEstimatedSweatLossLitres = highRate * duration.highDurationHours
  const recommendedDrinkRateLitresPerHour = recommendedDrinkRate(
    rate,
    replacementFraction,
    maxDrinkRateLitresPerHour,
  )
  const lowRecommendedDrinkRateLitresPerHour = recommendedDrinkRate(
    lowRate,
    replacementFraction,
    maxDrinkRateLitresPerHour,
  )
  const highRecommendedDrinkRateLitresPerHour = recommendedDrinkRate(
    highRate,
    replacementFraction,
    maxDrinkRateLitresPerHour,
  )
  const recommendedDrinkLitres =
    recommendedDrinkRateLitresPerHour * durationHours
  const lowRecommendedDrinkLitres =
    lowRecommendedDrinkRateLitresPerHour * duration.lowDurationHours
  const highRecommendedDrinkLitres =
    highRecommendedDrinkRateLitresPerHour * duration.highDurationHours
  const isHighSweatRate = rate >= HIGH_SWEAT_RATE_LITRES_PER_HOUR
  const needsSodiumGuidance =
    (durationHours >= 1 &&
      rate >= SODIUM_GUIDANCE_SWEAT_RATE_LITRES_PER_HOUR) ||
    isHighSweatRate
  const notes: string[] = []
  if (duration.source !== "planned") {
    notes.push(
      `Workout duration is estimated at ${duration.durationHours.toFixed(1)} h (range ${duration.lowDurationHours.toFixed(1)}–${duration.highDurationHours.toFixed(1)} h).`,
    )
  }
  if (!workout.isIndoor && !workout.weather) {
    notes.push("Weather was unavailable, so conditions were not matched.")
  }
  if (workout.usedFallbackStartTime) {
    notes.push(
      "The planned start hour is missing; current-hour weather was used.",
    )
  }
  if (source === "population" && weatherAdjustmentFactor !== 1) {
    const percent = Math.round((weatherAdjustmentFactor - 1) * 100)
    notes.push(
      `Population estimate adjusted ${percent > 0 ? "+" : ""}${percent}% for apparent temperature and humidity.`,
    )
  }
  if (isHighSweatRate) {
    notes.push(
      "Estimated sweat loss is unusually high; do not try to replace it fully during exercise. Replace the remainder gradually during recovery.",
    )
  }
  if (needsSodiumGuidance) {
    notes.push(
      `Consider a drink providing about ${SODIUM_MILLIGRAMS_PER_LITRE_LOW}–${SODIUM_MILLIGRAMS_PER_LITRE_HIGH} mg sodium/L, adjusted for medical advice and individual tolerance.`,
    )
  }
  const guidance =
    durationHours < 1
      ? "For this session, drink to thirst."
      : `Pace up to ${recommendedDrinkRateLitresPerHour.toFixed(2)} L/h through the session; avoid body-weight gain from overdrinking.`
  return {
    workoutId: workout.id,
    name: workout.name,
    durationHours,
    lowDurationHours: duration.lowDurationHours,
    highDurationHours: duration.highDurationHours,
    durationSource: duration.source,
    sweatRateLitresPerHour: rate,
    lowRateLitresPerHour: lowRate,
    highRateLitresPerHour: highRate,
    estimatedSweatLossLitres,
    lowEstimatedSweatLossLitres,
    highEstimatedSweatLossLitres,
    recommendedDrinkRateLitresPerHour,
    lowRecommendedDrinkRateLitresPerHour,
    highRecommendedDrinkRateLitresPerHour,
    recommendedDrinkLitres,
    replacementLitres: recommendedDrinkLitres,
    lowReplacementLitres: lowRecommendedDrinkLitres,
    highReplacementLitres: highRecommendedDrinkLitres,
    sweatRateConfidence,
    source,
    matchedTests: selected.length,
    weatherAdjustmentFactor,
    weatherAvailability:
      workout.isIndoor === true
        ? "not_applicable"
        : workout.weather
          ? "available"
          : "missing",
    isHighSweatRate,
    sodiumMilligramsPerLitreLow: needsSodiumGuidance
      ? SODIUM_MILLIGRAMS_PER_LITRE_LOW
      : undefined,
    sodiumMilligramsPerLitreHigh: needsSodiumGuidance
      ? SODIUM_MILLIGRAMS_PER_LITRE_HIGH
      : undefined,
    guidance,
    weather: workout.weather,
    notes,
  }
}

export function roundVolume(litres: number): number {
  return Math.round((litres + Number.EPSILON) * 10) / 10
}

export function buildDailyHydrationPlan(args: {
  sex?: string
  weightKg?: number
  workouts: HydrationWorkout[]
  sweatTests: SweatTest[]
  replacementFraction?: number
  maxDrinkRateLitresPerHour?: number
  referenceTime?: number
}): DailyHydrationPlan {
  const baselineLitres = baselineFluidsLitres(args.sex)
  const replacementFraction =
    args.replacementFraction ?? DEFAULT_SWEAT_REPLACEMENT_FRACTION
  const maxDrinkRateLitresPerHour =
    args.maxDrinkRateLitresPerHour !== undefined &&
    Number.isFinite(args.maxDrinkRateLitresPerHour) &&
    args.maxDrinkRateLitresPerHour > 0
      ? args.maxDrinkRateLitresPerHour
      : DEFAULT_MAX_DRINK_RATE_LITRES_PER_HOUR
  const workouts: WorkoutHydrationEstimate[] = []
  const missingData: string[] = []
  for (const workout of args.workouts) {
    const estimate = estimateWorkout(
      workout,
      args.sweatTests,
      replacementFraction,
      maxDrinkRateLitresPerHour,
      args.referenceTime ?? Date.now(),
      args.weightKg,
    )
    workouts.push(estimate)
  }
  const workoutReplacementLitres = workouts.reduce(
    (sum, workout) => sum + workout.replacementLitres,
    0,
  )
  const lowReplacement = workouts.reduce(
    (sum, workout) => sum + workout.lowReplacementLitres,
    0,
  )
  const highReplacement = workouts.reduce(
    (sum, workout) => sum + workout.highReplacementLitres,
    0,
  )
  const sweatRateConfidence = workouts.some(
    (workout) => workout.sweatRateConfidence === "low",
  )
    ? "low"
    : workouts.some((workout) => workout.sweatRateConfidence === "medium")
      ? "medium"
      : workouts.length > 0
        ? "high"
        : "not_applicable"
  const weatherRelevantWorkouts = workouts.filter(
    (workout) => workout.weatherAvailability !== "not_applicable",
  )
  const weatherAvailableCount = weatherRelevantWorkouts.filter(
    (workout) => workout.weatherAvailability === "available",
  ).length
  const weatherAvailability =
    weatherRelevantWorkouts.length === 0
      ? "not_applicable"
      : weatherAvailableCount === weatherRelevantWorkouts.length
        ? "available"
        : weatherAvailableCount > 0
          ? "partial"
          : "missing"
  // Workout drinking counts toward the daily beverage baseline. Only the
  // portion above that baseline increases the total-beverage target.
  const targetLitres = Math.max(baselineLitres, workoutReplacementLitres)
  const lowLitres = Math.max(baselineLitres, lowReplacement)
  const highLitres = Math.max(baselineLitres, highReplacement)
  if (
    args.weightKg === undefined &&
    workouts.some((w) => w.source === "population")
  ) {
    missingData.push(
      "Body weight is unavailable, so a broad adult athlete estimate was used.",
    )
  }
  return {
    targetType: "total_beverages",
    baselineLitres,
    replacementFraction: Math.min(
      Number.isFinite(replacementFraction)
        ? Math.max(0, replacementFraction)
        : DEFAULT_SWEAT_REPLACEMENT_FRACTION,
      1,
    ),
    maxDrinkRateLitresPerHour,
    workoutReplacementLitres,
    additionalAboveBaselineLitres: Math.max(
      0,
      workoutReplacementLitres - baselineLitres,
    ),
    targetLitres,
    lowLitres,
    highLitres,
    displayTargetLitres: roundVolume(targetLitres),
    displayLowLitres: roundVolume(lowLitres),
    displayHighLitres: roundVolume(highLitres),
    baselineConfidence: "high",
    sweatRateConfidence,
    weatherAvailability,
    workouts,
    missingData,
  }
}
