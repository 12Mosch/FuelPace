import { Link } from "@tanstack/react-router"
import { Bell, Flame, Settings } from "lucide-react"
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react"
import { currentIsoMonth } from "../lib/calendar"

type ActivePage = "today" | "training" | "settings"

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ")
}

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="FuelPace home">
      <span className="brand-mark" aria-hidden="true">
        <Flame strokeWidth={2.6} />
      </span>
      <span>FuelPace</span>
    </Link>
  )
}

export function AppShell({
  active,
  children,
}: {
  active: ActivePage
  children: ReactNode
}) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Brand />
        <nav className="site-nav" aria-label="Primary navigation">
          <Link aria-current={active === "today" ? "page" : undefined} to="/">
            Today
          </Link>
          <Link
            aria-current={active === "training" ? "page" : undefined}
            search={{ month: currentIsoMonth() }}
            to="/calendar"
          >
            Training
          </Link>
          <Link
            aria-current={active === "settings" ? "page" : undefined}
            to="/settings"
          >
            Settings
          </Link>
        </nav>
        <div className="header-tools">
          <Link
            className="icon-button"
            to="/settings"
            aria-label="Notifications"
          >
            <Bell />
          </Link>
          <Link
            className="profile-button"
            to="/settings"
            aria-label="Account settings"
          >
            <span>FP</span>
            <Settings />
          </Link>
        </div>
      </header>
      {children}
    </div>
  )
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost"

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx("button", `button-${variant}`, className)}
      {...props}
    />
  )
}

export function ButtonLink({
  className,
  variant = "primary",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant }) {
  return (
    <a className={cx("button", `button-${variant}`, className)} {...props} />
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="section-label">{children}</p>
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "success" | "warning" | "danger"
}) {
  return <span className={`status-pill status-${tone}`}>{children}</span>
}

export function Metric({
  icon,
  label,
  unit,
  value,
}: {
  icon: ReactNode
  label: string
  unit?: string
  value: string
}) {
  return (
    <div className="metric">
      <span className="metric-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="metric-copy">
        <small>{label}</small>
        <strong>{value}</strong>
        {unit ? <span>{unit}</span> : null}
      </span>
    </div>
  )
}
