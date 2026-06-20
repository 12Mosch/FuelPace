import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useState } from "react"
import { api } from "../../convex/_generated/api"

type IntervalsOutcome = "connected" | "denied" | "error"

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ context }) => {
    requireSettingsUser(context.user)
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { intervals?: IntervalsOutcome } => {
    const value = search.intervals
    return value === "connected" || value === "denied" || value === "error"
      ? { intervals: value }
      : {}
  },
  errorComponent: SettingsError,
  component: SettingsPage,
})

export function requireSettingsUser(user: unknown) {
  if (!user) {
    throw redirect({ href: "/api/auth/sign-in?returnPathname=/settings" })
  }
}

function SettingsError() {
  return (
    <main className="settings-shell">
      <section className="integration-card" role="alert">
        <div className="integration-content">
          <p className="section-kicker">Connection unavailable</p>
          <h1>Settings could not be loaded</h1>
          <p className="integration-copy">
            Refresh the page to try again. If the problem continues, return
            later without reconnecting or disconnecting your account.
          </p>
          <a className="button-primary" href="/settings">
            Try again
          </a>
        </div>
      </section>
    </main>
  )
}

function SettingsPage() {
  const { intervals } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <main className="settings-shell">
      <div className="settings-orbit" aria-hidden="true" />
      <header className="settings-header">
        <Link className="eyebrow-link" to="/">
          FuelPace
        </Link>
        <div>
          <p className="section-kicker">Account controls</p>
          <h1>Settings</h1>
          <p>Manage the services FuelPace can use on your behalf.</p>
        </div>
      </header>

      {intervals ? (
        <Notice
          outcome={intervals}
          onDismiss={() => navigate({ search: {}, replace: true })}
        />
      ) : null}

      <IntervalsCard />
    </main>
  )
}

function Notice({
  outcome,
  onDismiss,
}: {
  outcome: IntervalsOutcome
  onDismiss: () => void
}) {
  const content = {
    connected: {
      title: "Intervals.icu connected",
      body: "Your read-only activity connection is ready.",
      tone: "success",
    },
    denied: {
      title: "Connection cancelled",
      body: "Nothing changed. Any existing connection is still active.",
      tone: "neutral",
    },
    error: {
      title: "Connection failed",
      body: "Try connecting again. Your existing connection, if any, was preserved.",
      tone: "error",
    },
  }[outcome]

  return (
    <aside className={`notice notice-${content.tone}`} role="status">
      <div>
        <strong>{content.title}</strong>
        <p>{content.body}</p>
      </div>
      <button aria-label="Dismiss message" onClick={onDismiss} type="button">
        Dismiss
      </button>
    </aside>
  )
}

export function IntervalsCard() {
  const connection = useQuery(api.intervals.getConnection, {})
  const disconnect = useMutation(api.intervals.disconnect)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Intervals.icu from FuelPace?")) return
    setFailure(null)
    setIsDisconnecting(true)
    try {
      await disconnect({})
    } catch {
      setFailure("FuelPace could not disconnect the account. Please try again.")
    } finally {
      setIsDisconnecting(false)
    }
  }

  return (
    <IntervalsCardView
      connection={connection}
      failure={failure}
      isDisconnecting={isDisconnecting}
      onDisconnect={handleDisconnect}
    />
  )
}

type Connection = NonNullable<
  FunctionReturnType<typeof api.intervals.getConnection>
>

export function IntervalsCardView({
  connection,
  failure,
  isDisconnecting,
  onDisconnect,
}: {
  connection: Connection | null | undefined
  failure: string | null
  isDisconnecting: boolean
  onDisconnect: () => void
}) {
  return (
    <section className="integration-card" aria-labelledby="intervals-title">
      <div className="integration-mark" aria-hidden="true">
        <span>i</span>
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
              className={`status-pill ${connection ? "status-on" : "status-off"}`}
            >
              {connection ? "Connected" : "Not connected"}
            </span>
          )}
        </div>

        {connection === undefined ? (
          <div className="connection-loading" aria-live="polite">
            Loading connection status...
          </div>
        ) : connection ? (
          <div className="connection-details">
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
                <dt>Permission</dt>
                <dd>
                  <code>ACTIVITY:READ</code>
                </dd>
              </div>
              <div>
                <dt>Connected</dt>
                <dd>
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                  }).format(connection.connectedAt)}
                </dd>
              </div>
            </dl>
            <p className="integration-copy">
              Reconnect to replace the current credential or restore access
              after Intervals.icu invalidates it.
            </p>
            <div className="integration-actions">
              <a
                className="button-primary"
                href="/api/integrations/intervals/connect"
              >
                Reconnect
              </a>
              <button
                className="button-danger"
                disabled={isDisconnecting}
                onClick={onDisconnect}
                type="button"
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
            <p className="revocation-note">
              Disconnect removes the credential from FuelPace only. You can also
              revoke FuelPace from your Intervals.icu settings.
            </p>
          </div>
        ) : (
          <div className="connection-details">
            <p className="integration-copy">
              Connect your athlete account so FuelPace can read completed
              training activities. FuelPace requests read-only activity access
              and cannot change your Intervals.icu data.
            </p>
            <div className="permission-line">
              <span aria-hidden="true">Read only</span>
              <code>ACTIVITY:READ</code>
            </div>
            <a
              className="button-primary"
              href="/api/integrations/intervals/connect"
            >
              Connect Intervals.icu
            </a>
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
