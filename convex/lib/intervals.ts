export type IntervalsAthlete = {
  athleteId: string
  athleteName: string
}

export function parseIntervalsAthleteResponse(
  value: unknown,
): IntervalsAthlete {
  if (!value || typeof value !== "object") {
    throw new Error("Intervals.icu returned an invalid response")
  }

  const response = value as Record<string, unknown>
  if (typeof response.id !== "string" || response.id.trim().length === 0) {
    throw new Error("Intervals.icu did not return an athlete ID")
  }
  if (typeof response.name !== "string" || response.name.trim().length === 0) {
    throw new Error("Intervals.icu did not return an athlete name")
  }

  return {
    athleteId: response.id.trim(),
    athleteName: response.name.trim(),
  }
}
