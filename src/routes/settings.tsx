import { createFileRoute, Link } from "@tanstack/react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  Droplets,
  KeyRound,
  Link2,
  MapPin,
  Search,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react"
import { type FormEvent, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { AppShell, Button, ButtonLink, SectionLabel } from "../components/ui"
import { requireRouteUser } from "../lib/route-auth"

const INTERVALS_DEVELOPER_SETTINGS_URL = "https://intervals.icu/settings"

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ context }) => {
    requireSettingsUser(context.user)
  },
  errorComponent: SettingsError,
  component: SettingsPage,
})

export function requireSettingsUser(user: unknown) {
  requireRouteUser(user, "/settings")
}

function SettingsError() {
  return (
    <AppShell active="settings">
      <main className="page-content settings-shell">
        <section className="integration-card" role="alert">
          <div className="integration-content">
            <SectionLabel>Connection unavailable</SectionLabel>
            <h1>Settings could not be loaded</h1>
            <p className="integration-copy">
              Refresh the page to try again. Your existing connection has not
              been changed.
            </p>
            <ButtonLink href="/settings">Try again</ButtonLink>
          </div>
        </section>
      </main>
    </AppShell>
  )
}

function SettingsPage() {
  return (
    <AppShell active="settings">
      <main className="page-content settings-shell">
        <header className="settings-header">
          <div>
            <SectionLabel>Account controls</SectionLabel>
            <h1>Settings</h1>
            <p>Manage the services FuelPace can use on your behalf.</p>
          </div>
          <Link className="back-link" to="/">
            Back to today
          </Link>
        </header>
        <div className="settings-layout">
          <aside className="settings-nav" aria-label="Settings sections">
            <a aria-current="page" href="#connections">
              <Link2 /> Connections
            </a>
            <a href="#hydration">
              <Droplets /> Hydration
            </a>
            <span>
              <ShieldCheck /> Privacy &amp; data
            </span>
          </aside>
          <div className="settings-cards">
            <IntervalsCard />
            <HydrationSettings />
          </div>
        </div>
      </main>
    </AppShell>
  )
}

type LocationResult = {
  id: number
  displayName: string
  latitude: number
  longitude: number
  timezone: string
}

export function HydrationSettings() {
  const location = useQuery(api.hydration.getSettings, {})
  const activities = useQuery(api.hydration.listCalibrationActivities, {})
  const tests = useQuery(api.hydration.listSweatTests, {})
  const searchLocations = useAction(api.hydrationWeather.searchLocations)
  const refreshWeather = useAction(api.hydrationWeather.refreshWeather)
  const saveLocation = useMutation(api.hydration.saveLocation)
  const clearLocation = useMutation(api.hydration.clearLocation)
  const createTest = useAction(api.hydration.createSweatTest)
  const deleteTest = useMutation(api.hydration.deleteSweatTest)
  return (
    <HydrationSettingsView
      activities={activities ?? []}
      location={location}
      tests={tests ?? []}
      onClearLocation={() => clearLocation({})}
      onCreateTest={createTest}
      onDeleteTest={(id) => deleteTest({ id })}
      onSaveLocation={async (result) => {
        await saveLocation(result)
        await refreshWeather({})
      }}
      onSearch={(query) => searchLocations({ query })}
    />
  )
}

type CalibrationActivity = {
  sourceActivityId: string
  name?: string
  localStartDateTime: string
  startAt: number
  sport: string
  durationSeconds: number
  isIndoor: boolean
  intensity?: number
}

type SweatTestSummary = {
  id: Id<"hydrationSweatTests">
  activityName?: string
  activityStartAt: number
  sweatRateLitresPerHour: number
  lowSweatRateLitresPerHour?: number
  highSweatRateLitresPerHour?: number
  sport: string
  isIndoor: boolean
  weather?: { apparentTemperatureC: number }
}

const KG_PER_POUND = 0.45359237
const LITRES_PER_FLUID_OUNCE = 0.0295735

export function HydrationSettingsView({
  activities,
  location,
  tests,
  onSearch,
  onSaveLocation,
  onClearLocation,
  onCreateTest,
  onDeleteTest,
}: {
  activities: CalibrationActivity[]
  location: Omit<LocationResult, "id"> | null | undefined
  tests: SweatTestSummary[]
  onSearch: (query: string) => Promise<LocationResult[]>
  onSaveLocation: (location: Omit<LocationResult, "id">) => Promise<unknown>
  onClearLocation: () => Promise<unknown>
  onCreateTest: (args: {
    sourceActivityId: string
    preWeightKg: number
    postWeightKg: number
    consumedLitres: number
    urineLitres?: number
    scalePrecisionKg?: number
    volumePrecisionLitres?: number
    wetClothingAdjustmentKg?: number
    wetClothingUncertaintyKg?: number
    durationSeconds: number
  }) => Promise<unknown>
  onDeleteTest: (id: Id<"hydrationSweatTests">) => Promise<unknown>
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<LocationResult[]>([])
  const [units, setUnits] = useState<"metric" | "us">("metric")
  const [activityId, setActivityId] = useState("")
  const [preWeight, setPreWeight] = useState("")
  const [postWeight, setPostWeight] = useState("")
  const [consumed, setConsumed] = useState("")
  const [urine, setUrine] = useState("")
  const [scalePrecision, setScalePrecision] = useState("0.1")
  const [volumePrecision, setVolumePrecision] = useState("0.05")
  const [wetClothing, setWetClothing] = useState("0")
  const [wetClothingUncertainty, setWetClothingUncertainty] = useState("0")
  const [durationMinutes, setDurationMinutes] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleLocationSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy("search")
    setMessage(null)
    try {
      setResults(await onSearch(query))
    } catch {
      setMessage("Location search is temporarily unavailable.")
    } finally {
      setBusy(null)
    }
  }

  async function handleSaveLocation(result: LocationResult) {
    const { id: _id, ...selected } = result
    setBusy("location")
    setMessage(null)
    try {
      await onSaveLocation(selected)
      setResults([])
    } catch {
      setMessage("The training location could not be saved. Please try again.")
    } finally {
      setBusy(null)
    }
  }

  async function handleClearLocation() {
    setBusy("location")
    setMessage(null)
    try {
      await onClearLocation()
    } catch {
      setMessage(
        "The training location could not be removed. Please try again.",
      )
    } finally {
      setBusy(null)
    }
  }

  async function handleDeleteTest(id: Id<"hydrationSweatTests">) {
    setBusy("delete-test")
    setMessage(null)
    try {
      await onDeleteTest(id)
    } catch {
      setMessage("The sweat test could not be deleted. Please try again.")
    } finally {
      setBusy(null)
    }
  }

  async function handleTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setBusy("test")
    const weightFactor = units === "us" ? KG_PER_POUND : 1
    const volumeFactor = units === "us" ? LITRES_PER_FLUID_OUNCE : 1
    try {
      await onCreateTest({
        sourceActivityId: activityId,
        preWeightKg: Number(preWeight) * weightFactor,
        postWeightKg: Number(postWeight) * weightFactor,
        consumedLitres: Number(consumed) * volumeFactor,
        urineLitres: urine ? Number(urine) * volumeFactor : undefined,
        scalePrecisionKg: Number(scalePrecision) * weightFactor,
        volumePrecisionLitres: Number(volumePrecision) * volumeFactor,
        wetClothingAdjustmentKg: Number(wetClothing) * weightFactor,
        wetClothingUncertaintyKg: Number(wetClothingUncertainty) * weightFactor,
        durationSeconds: Number(durationMinutes) * 60,
      })
      setPreWeight("")
      setPostWeight("")
      setConsumed("")
      setUrine("")
      setWetClothing("0")
      setWetClothingUncertainty("0")
      setActivityId("")
      setDurationMinutes("")
      setMessage("Sweat test saved.")
    } catch (error) {
      const code =
        error && typeof error === "object" && "data" in error
          ? (error as { data?: { code?: string } }).data?.code
          : undefined
      setMessage(
        code === "DUPLICATE_ACTIVITY"
          ? "This activity already has a sweat test."
          : "Check the measurements, uncertainty, and body-mass change. The full sweat-rate range must be between 0.1 and 6.0 L/h.",
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      className="integration-card hydration-settings"
      id="hydration"
      aria-labelledby="hydration-title"
    >
      <div className="integration-mark hydration-mark" aria-hidden="true">
        <Droplets />
      </div>
      <div className="integration-content">
        <div className="integration-heading">
          <div>
            <p className="section-kicker">Personal calibration</p>
            <h2 id="hydration-title">Hydration</h2>
          </div>
        </div>
        <p className="integration-copy">
          Set your usual training location for outdoor forecasts, then add
          measured sweat tests to replace population estimates.
        </p>

        <div className="hydration-settings-grid">
          <div className="hydration-subsection">
            <h3>
              <MapPin /> Training location
            </h3>
            {location === undefined ? <p>Loading location...</p> : null}
            {location ? (
              <div className="saved-location">
                <span>
                  <strong>{location.displayName}</strong>
                  <small>{location.timezone}</small>
                </span>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={busy === "location"}
                  onClick={() => void handleClearLocation()}
                >
                  Remove
                </Button>
              </div>
            ) : null}
            <form className="location-search" onSubmit={handleLocationSearch}>
              <label htmlFor="hydration-location">Search city or place</label>
              <div>
                <input
                  id="hydration-location"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  minLength={2}
                  required
                />
                <Button disabled={busy === "search"} type="submit">
                  <Search /> Search
                </Button>
              </div>
            </form>
            {results.length > 0 ? (
              <ul className="location-results" aria-label="Location results">
                {results.map((result) => (
                  <li key={result.id}>
                    <button
                      type="button"
                      disabled={busy === "location"}
                      onClick={() => void handleSaveLocation(result)}
                    >
                      <strong>{result.displayName}</strong>
                      <small>{result.timezone}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="hydration-subsection">
            <div className="subsection-heading">
              <h3>
                <Droplets /> Add a sweat test
              </h3>
              <select
                aria-label="Measurement units"
                value={units}
                onChange={(event) => {
                  const nextUnits = event.target.value as "metric" | "us"
                  setUnits(nextUnits)
                  setScalePrecision(nextUnits === "us" ? "0.2" : "0.1")
                  setVolumePrecision(nextUnits === "us" ? "1" : "0.05")
                  setWetClothing("0")
                  setWetClothingUncertainty("0")
                }}
              >
                <option value="metric">Metric</option>
                <option value="us">US units</option>
              </select>
            </div>
            <form className="sweat-test-form" onSubmit={handleTest}>
              <label className="full-field" htmlFor="sweat-activity">
                Imported activity
              </label>
              <select
                id="sweat-activity"
                required
                value={activityId}
                onChange={(event) => {
                  setActivityId(event.target.value)
                  const activity = activities.find(
                    (item) => item.sourceActivityId === event.target.value,
                  )
                  setDurationMinutes(
                    activity
                      ? String(Math.round(activity.durationSeconds / 60))
                      : "",
                  )
                }}
              >
                <option value="">Select an activity</option>
                {activities.map((activity) => (
                  <option
                    key={activity.sourceActivityId}
                    value={activity.sourceActivityId}
                  >
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                    }).format(activity.startAt)}{" "}
                    · {activity.name ?? activity.sport}
                  </option>
                ))}
              </select>
              <label>
                Pre weight ({units === "metric" ? "kg" : "lb"})
                <input
                  inputMode="decimal"
                  min="1"
                  step="0.01"
                  required
                  value={preWeight}
                  onChange={(event) => setPreWeight(event.target.value)}
                />
              </label>
              <label>
                Post weight ({units === "metric" ? "kg" : "lb"})
                <input
                  inputMode="decimal"
                  min="1"
                  step="0.01"
                  required
                  value={postWeight}
                  onChange={(event) => setPostWeight(event.target.value)}
                />
              </label>
              <label>
                Consumed ({units === "metric" ? "L" : "fl oz"})
                <input
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  value={consumed}
                  onChange={(event) => setConsumed(event.target.value)}
                />
              </label>
              <label>
                Urine, optional ({units === "metric" ? "L" : "fl oz"})
                <input
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={urine}
                  onChange={(event) => setUrine(event.target.value)}
                />
              </label>
              <label>
                Duration (minutes)
                <input
                  inputMode="numeric"
                  min="1"
                  step="1"
                  required
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                />
              </label>
              <label>
                Scale resolution ({units === "metric" ? "kg" : "lb"})
                <input
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  value={scalePrecision}
                  onChange={(event) => setScalePrecision(event.target.value)}
                />
              </label>
              <label>
                Fluid container resolution ({units === "metric" ? "L" : "fl oz"}
                )
                <input
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  value={volumePrecision}
                  onChange={(event) => setVolumePrecision(event.target.value)}
                />
              </label>
              <label>
                Retained clothing water ({units === "metric" ? "kg" : "lb"})
                <input
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  value={wetClothing}
                  onChange={(event) => setWetClothing(event.target.value)}
                />
              </label>
              <label>
                Clothing estimate uncertainty (
                {units === "metric" ? "kg" : "lb"})
                <input
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  value={wetClothingUncertainty}
                  onChange={(event) =>
                    setWetClothingUncertainty(event.target.value)
                  }
                />
              </label>
              <Button
                disabled={busy === "test" || activities.length === 0}
                type="submit"
              >
                {busy === "test" ? "Saving..." : "Save sweat test"}
              </Button>
            </form>
            {activities.length === 0 ? (
              <p className="field-help">
                No eligible imported activities are available yet.
              </p>
            ) : null}
          </div>
        </div>

        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
        <div className="sweat-history">
          <h3>Measurement history</h3>
          {tests.length === 0 ? (
            <p>No sweat tests yet.</p>
          ) : (
            <ul>
              {tests.map((test) => (
                <li key={test.id}>
                  <span>
                    <strong>
                      {test.lowSweatRateLitresPerHour !== undefined &&
                      test.highSweatRateLitresPerHour !== undefined
                        ? `${test.lowSweatRateLitresPerHour.toFixed(2)}–${test.highSweatRateLitresPerHour.toFixed(2)} L/h`
                        : `${test.sweatRateLitresPerHour.toFixed(2)} L/h`}
                    </strong>
                    <small>
                      {test.activityName ?? test.sport} ·{" "}
                      {test.isIndoor
                        ? "Indoor"
                        : test.weather
                          ? `${Math.round(test.weather.apparentTemperatureC)}°C apparent`
                          : "Outdoor"}
                    </small>
                  </span>
                  <Button
                    aria-label={`Delete sweat test for ${test.activityName ?? test.sport}`}
                    variant="ghost"
                    type="button"
                    disabled={busy === "delete-test"}
                    onClick={() => void handleDeleteTest(test.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="clinical-note">
          For healthy adults. Pregnancy, kidney or heart conditions, fluid
          restrictions, and other clinical circumstances require individual
          medical guidance.
        </p>
      </div>
    </section>
  )
}

export function IntervalsCard() {
  const connection = useQuery(api.intervals.getConnection, {})
  const connect = useAction(api.intervals.connectWithApiKey)
  const disconnect = useMutation(api.intervals.disconnect)

  return (
    <IntervalsCardView
      connection={connection}
      onConnect={(apiKey) => connect({ apiKey })}
      onDisconnect={() => disconnect({})}
    />
  )
}

export type Connection = NonNullable<
  FunctionReturnType<typeof api.intervals.getConnection>
>

const SYNC_ERROR_MESSAGES: Record<string, string> = {
  INVALID_API_KEY: "The saved Intervals.icu credential is no longer valid.",
  INTERVALS_UNAVAILABLE: "Intervals.icu could not be reached during refresh.",
  INVALID_RESPONSE: "Intervals.icu returned data FuelPace could not import.",
  STALE_IMPORT: "A newer connection replaced this refresh.",
}

function formatSyncTime(value: number | undefined): string {
  if (value === undefined) return "Not yet"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

function connectionStatusLabel(connection: Connection): string {
  if (connection.syncStatus === "queued") return "Refresh queued"
  if (connection.syncStatus === "importing") return "Importing"
  if (connection.syncStatus === "error") return "Refresh failed"
  if (connection.syncStatus === "never_synced") return "Awaiting import"
  return "Up to date"
}

export function intervalsConnectionErrorMessage(error: unknown): string {
  const data =
    error && typeof error === "object" && "data" in error
      ? (error as { data?: unknown }).data
      : undefined
  const code =
    data && typeof data === "object" && "code" in data
      ? (data as { code?: unknown }).code
      : undefined

  if (code === "INVALID_API_KEY") {
    return "That API key is invalid. Check the key in Intervals.icu and try again."
  }
  if (code === "INTERVALS_UNAVAILABLE") {
    return "Intervals.icu is temporarily unavailable. Please try again later."
  }
  if (code === "INVALID_RESPONSE") {
    return "Intervals.icu returned an unexpected response. Please try again later."
  }
  return "FuelPace could not connect the account. Please try again."
}

export function IntervalsCardView({
  connection,
  onConnect,
  onDisconnect,
}: {
  connection: Connection | null | undefined
  onConnect: (apiKey: string) => Promise<unknown>
  onDisconnect: () => Promise<unknown>
}) {
  const [apiKey, setApiKey] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFailure(null)
    setIsConnecting(true)
    try {
      await onConnect(apiKey)
      setApiKey("")
    } catch (error) {
      setFailure(intervalsConnectionErrorMessage(error))
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Intervals.icu from FuelPace?")) return
    setFailure(null)
    setIsDisconnecting(true)
    try {
      await onDisconnect()
    } catch {
      setFailure("FuelPace could not disconnect the account. Please try again.")
    } finally {
      setIsDisconnecting(false)
    }
  }

  return (
    <section
      className="integration-card"
      aria-labelledby="intervals-title"
      id="connections"
    >
      <div className="integration-mark" aria-hidden="true">
        <Link2 />
      </div>
      <div className="integration-content">
        <div className="integration-heading">
          <div>
            <p className="section-kicker">Training data</p>
            <h2 id="intervals-title">Intervals.icu</h2>
          </div>
          {connection === undefined ? (
            <span className="status-pill status-loading">Checking</span>
          ) : (
            <span
              className={`status-pill ${
                connection
                  ? connection.syncStatus === "error"
                    ? "status-error"
                    : connection.syncStatus === "queued" ||
                        connection.syncStatus === "importing"
                      ? "status-syncing"
                      : "status-on"
                  : "status-off"
              }`}
            >
              {connection ? connectionStatusLabel(connection) : "Not connected"}
            </span>
          )}
        </div>

        {connection === undefined ? (
          <div className="connection-loading" aria-live="polite">
            Loading connection status...
          </div>
        ) : (
          <div className="connection-details">
            {connection ? (
              <>
                <dl>
                  <div>
                    <dt>Athlete</dt>
                    <dd>{connection.athleteName}</dd>
                  </div>
                  <div>
                    <dt>Intervals.icu ID</dt>
                    <dd>{connection.athleteId}</dd>
                  </div>
                  <div>
                    <dt>Connected</dt>
                    <dd>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                      }).format(connection.connectedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt>Last refresh</dt>
                    <dd>{formatSyncTime(connection.lastSuccessfulSyncAt)}</dd>
                  </div>
                  <div>
                    <dt>Imported</dt>
                    <dd>
                      {connection.importedPlannedWorkoutCount} planned,{" "}
                      {connection.importedActivityCount} completed
                    </dd>
                  </div>
                </dl>
                {connection.syncStatus === "queued" ? (
                  <p className="sync-note" aria-live="polite">
                    Your Intervals.icu refresh is queued.
                  </p>
                ) : null}
                {connection.syncStatus === "importing" ? (
                  <p className="sync-note" aria-live="polite">
                    Importing your latest profile, workouts, and activities.
                  </p>
                ) : null}
                {connection.syncStatus === "never_synced" ? (
                  <p className="sync-note">
                    FuelPace has not completed its first import yet.
                  </p>
                ) : null}
                {connection.syncStatus === "error" ? (
                  <p className="sync-note sync-note-error" role="status">
                    {SYNC_ERROR_MESSAGES[connection.lastSyncErrorCode ?? ""] ??
                      "The latest Intervals.icu refresh failed."}{" "}
                    {connection.lastSuccessfulSyncAt !== undefined
                      ? "Your previously imported data remains available."
                      : "No Intervals.icu data has been imported yet."}
                  </p>
                ) : null}
                <p className="integration-copy">
                  Submit a new API key below to replace the stored credential.
                </p>
              </>
            ) : (
              <p className="integration-copy">
                Add an API key so FuelPace can access your Intervals.icu
                training data. This key grants account-level API access, not a
                limited or read-only permission.
              </p>
            )}

            <form className="api-key-form" onSubmit={handleConnect}>
              <label htmlFor="intervals-api-key">Intervals.icu API key</label>
              <input
                autoComplete="new-password"
                id="intervals-api-key"
                name="intervalsApiKey"
                onChange={(event) => setApiKey(event.target.value)}
                required
                type="password"
                value={apiKey}
              />
              <p className="field-help">
                Generate or copy your key in{" "}
                <a href={INTERVALS_DEVELOPER_SETTINGS_URL}>
                  Intervals.icu Developer Settings
                </a>
                .
              </p>
              <div className="integration-actions">
                <Button
                  disabled={isConnecting || isDisconnecting}
                  type="submit"
                >
                  {isConnecting
                    ? "Connecting..."
                    : connection
                      ? "Replace API key"
                      : "Connect Intervals.icu"}
                </Button>
                {connection ? (
                  <Button
                    disabled={isConnecting || isDisconnecting}
                    onClick={handleDisconnect}
                    type="button"
                    variant="danger"
                  >
                    <Unplug />
                    {isDisconnecting ? "Disconnecting..." : "Disconnect"}
                  </Button>
                ) : null}
              </div>
            </form>

            <p className="revocation-note">
              <KeyRound aria-hidden="true" />
              Treat this API key as an account-wide credential. If it is
              compromised, revoke or regenerate it in Intervals.icu.
              Disconnecting removes it from FuelPace only.
            </p>
          </div>
        )}

        {failure ? (
          <p className="form-error" role="alert">
            {failure}
          </p>
        ) : null}
      </div>
    </section>
  )
}
