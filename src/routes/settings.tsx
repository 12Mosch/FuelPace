import { createFileRoute, Link } from "@tanstack/react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { KeyRound, Link2, ShieldCheck, Unplug } from "lucide-react"
import { type FormEvent, useState } from "react"
import { api } from "../../convex/_generated/api"
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
            <span>
              <ShieldCheck /> Privacy &amp; data
            </span>
          </aside>
          <IntervalsCard />
        </div>
      </main>
    </AppShell>
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
