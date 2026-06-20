import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useAuth } from "@workos/authkit-tanstack-react-start/client"
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react"
import {
  Bike,
  CalendarDays,
  Check,
  ChevronRight,
  CircleGauge,
  Clock3,
  Droplets,
  Flame,
  Leaf,
  RefreshCw,
  Salad,
  Sparkles,
  Wheat,
} from "lucide-react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import {
  AppShell,
  Button,
  ButtonLink,
  Metric,
  SectionLabel,
} from "../components/ui"
import { currentIsoMonth } from "../lib/calendar"

export const Route = createFileRoute("/")({ component: Home })

function Home() {
  return (
    <AppShell active="today">
      <AuthLoading>
        <main className="page-content">
          <section className="loading-panel" aria-live="polite">
            <RefreshCw className="spin" />
            <h1>Building today&apos;s plan</h1>
            <p>Loading your training context and account.</p>
          </section>
        </main>
      </AuthLoading>
      <Authenticated>
        <SignedIn />
      </Authenticated>
      <Unauthenticated>
        <SignedOut />
      </Unauthenticated>
    </AppShell>
  )
}

function SignedIn() {
  const { signOut, user } = useAuth()
  const { data } = useSuspenseQuery(convexQuery(api.auth.viewer, {}))

  return (
    <main className="page-content today-page">
      <section className="today-hero">
        <div className="hero-copy">
          <SectionLabel>Today&apos;s plan</SectionLabel>
          <h1>
            Your fuel plan
            <br />
            for today.
          </h1>
        </div>
        <div className="hero-landscape" aria-hidden="true">
          <img
            alt=""
            className="hero-image"
            height="800"
            src="/fuelpace-cyclist-hero.webp"
            width="1600"
          />
        </div>
      </section>

      <section className="target-section">
        <div className="section-heading-row">
          <SectionLabel>Daily targets</SectionLabel>
          <span>Targets unlock when your nutrition profile is ready</span>
        </div>
        <div className="metrics-band">
          <Metric icon={<Flame />} label="Calories" value="—" unit="kcal" />
          <Metric icon={<Wheat />} label="Carbs" value="—" unit="g" />
          <Metric icon={<Sparkles />} label="Protein" value="—" unit="g" />
          <Metric icon={<Droplets />} label="Hydration" value="—" unit="L" />
          <Metric icon={<Leaf />} label="Fat" value="—" unit="g" />
        </div>
      </section>

      <section className="today-grid">
        <article className="workout-panel">
          <div className="panel-title">
            <span className="large-icon">
              <Bike />
            </span>
            <div>
              <SectionLabel>Today&apos;s workout</SectionLabel>
              <h2>Ready for your next session</h2>
            </div>
          </div>
          <div className="workout-facts">
            <span>
              <Clock3 /> Duration <strong>From your plan</strong>
            </span>
            <span>
              <CircleGauge /> Load <strong>Auto-imported</strong>
            </span>
          </div>
          <Link
            className="button button-primary"
            search={{ month: currentIsoMonth() }}
            to="/calendar"
          >
            Open training calendar <ChevronRight />
          </Link>
        </article>

        <article className="insight-panel">
          <SectionLabel>FuelPace setup</SectionLabel>
          <h2>Turn training into a daily nutrition plan.</h2>
          <ul className="check-list">
            <li>
              <Check /> Intervals.icu training data
            </li>
            <li>
              <Check /> Personal nutrition profile
            </li>
            <li>
              <Check /> Adaptive daily recommendations
            </li>
          </ul>
          <ButtonLink href="/settings" variant="secondary">
            Review your connection
          </ButtonLink>
        </article>
      </section>

      <section className="account-strip">
        <div>
          <span className="mini-icon">
            <CalendarDays />
          </span>
          <p>
            <small>Signed in as</small>
            <EmailReveal email={user?.email ?? data.email ?? data.subject} />
          </p>
        </div>
        <Button onClick={() => signOut()} variant="ghost" type="button">
          Sign out
        </Button>
      </section>
    </main>
  )
}

export function EmailReveal({ email }: { email: string }) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <button
      aria-expanded={isVisible}
      aria-label={isVisible ? "Hide email address" : "Reveal email address"}
      className={`email-reveal${isVisible ? " is-visible" : ""}`}
      onClick={() => setIsVisible((visible) => !visible)}
      type="button"
    >
      <span>{isVisible ? email : "********"}</span>
      <small className="email-tooltip" role="tooltip">
        {isVisible ? "Click to hide" : "Click to reveal"}
      </small>
    </button>
  )
}

function SignedOut() {
  return (
    <main className="page-content signed-out-page">
      <section className="landing-hero">
        <div className="landing-copy">
          <SectionLabel>Training in. Better fueling out.</SectionLabel>
          <h1>
            Fuel every effort.
            <br />
            <em>Recover for the next.</em>
          </h1>
          <p>
            FuelPace turns your Intervals.icu training plan into practical daily
            nutrition and workout-fueling guidance.
          </p>
          <div className="landing-actions">
            <ButtonLink href="/api/auth/sign-up">Create your plan</ButtonLink>
            <ButtonLink href="/api/auth/sign-in" variant="secondary">
              Sign in
            </ButtonLink>
          </div>
        </div>
        <div className="landing-visual" aria-hidden="true">
          <div className="pace-ring">
            <Bike />
          </div>
          <span className="stat-card stat-one">
            <Flame /> Personalized targets
          </span>
          <span className="stat-card stat-two">
            <Salad /> Recovery meals
          </span>
        </div>
      </section>
      <section className="feature-row" aria-label="FuelPace features">
        <div>
          <strong>01</strong>
          <span>Sync training</span>
          <p>Your calendar becomes the source of truth.</p>
        </div>
        <div>
          <strong>02</strong>
          <span>Calculate demand</span>
          <p>Targets respond to the work ahead.</p>
        </div>
        <div>
          <strong>03</strong>
          <span>Fuel with clarity</span>
          <p>Simple guidance for training and recovery.</p>
        </div>
      </section>
    </main>
  )
}
