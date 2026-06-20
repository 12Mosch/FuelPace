export const REQUIRED_INTERVALS_SCOPE = "ACTIVITY:READ"

export type IntervalsToken = {
  accessToken: string
  athleteId: string
  athleteName: string
  grantedScopes: string[]
}

export function normalizeScopes(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.filter((scope): scope is string => typeof scope === "string")
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : []

  return [
    ...new Set(raw.map((scope) => scope.trim().toUpperCase()).filter(Boolean)),
  ]
}

export function hasRequiredIntervalsScope(scopes: string[]): boolean {
  return scopes.includes(REQUIRED_INTERVALS_SCOPE)
}

export function parseIntervalsTokenResponse(value: unknown): IntervalsToken {
  if (!value || typeof value !== "object") {
    throw new Error("Intervals.icu returned an invalid response")
  }

  const response = value as Record<string, unknown>
  const athlete = response.athlete
  if (!athlete || typeof athlete !== "object") {
    throw new Error("Intervals.icu did not return an athlete")
  }

  const athleteRecord = athlete as Record<string, unknown>
  const accessToken = response.access_token
  const tokenType = response.token_type
  const athleteId = athleteRecord.id
  const athleteName = athleteRecord.name
  const grantedScopes = normalizeScopes(response.scope)

  if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
    throw new Error("Intervals.icu did not return an access token")
  }
  if (typeof tokenType !== "string" || tokenType.toLowerCase() !== "bearer") {
    throw new Error("Intervals.icu did not return a bearer token")
  }
  if (typeof athleteId !== "string" || athleteId.trim().length === 0) {
    throw new Error("Intervals.icu did not return an athlete ID")
  }
  if (typeof athleteName !== "string" || athleteName.trim().length === 0) {
    throw new Error("Intervals.icu did not return an athlete name")
  }
  if (!hasRequiredIntervalsScope(grantedScopes)) {
    throw new Error("Intervals.icu did not grant the required scope")
  }

  return {
    accessToken: accessToken.trim(),
    athleteId: athleteId.trim(),
    athleteName: athleteName.trim(),
    grantedScopes,
  }
}
