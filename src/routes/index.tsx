import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useAuth } from "@workos/authkit-tanstack-react-start/client"
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useAction,
  useQuery,
} from "convex/react"
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
import { useEffect, useRef, useState } from "react"
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
  const hydration = useQuery(api.hydration.getDailyPlan, {})
  const refreshWeather = useAction(api.hydrationWeather.refreshWeather)
  const attemptedWeatherRefresh = useRef(false)

  useEffect(() => {
    if (
      hydration &&
      hydration.weatherStatus !== "fresh" &&
      !attemptedWeatherRefresh.current
    ) {
      attemptedWeatherRefresh.current = true
      void refreshWeather({}).catch((error: unknown) => {
        attemptedWeatherRefresh.current = false
        console.error("Weather refresh failed", error)
      })
    }
  }, [hydration, refreshWeather])

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
          <span>Hydration responds to today&apos;s training load</span>
        </div>
        <div className="metrics-band">
          <Metric icon={<Flame />} label="Calories" value="—" unit="kcal" />
          <Metric icon={<Wheat />} label="Carbs" value="—" unit="g" />
          <Metric icon={<Sparkles />} label="Protein" value="—" unit="g" />
          <Metric
            icon={<Droplets />}
            label="Hydration"
            value={hydration ? hydration.displayTargetLitres.toFixed(1) : "—"}
            unit="L"
          />
          <Metric icon={<Leaf />} label="Fat" value="—" unit="g" />
        </div>
      </section>

      <HydrationTargetView plan={hydration} />

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

export type HydrationPlanView = {
  targetType: "total_beverages"
  baselineLitres: number
  replacementFraction: number
  maxDrinkRateLitresPerHour: number
  workoutReplacementLitres: number
  additionalAboveBaselineLitres: number
  displayTargetLitres: number
  displayLowLitres: number
  displayHighLitres: number
  baselineConfidence: "high"
  sweatRateConfidence: "not_applicable" | "high" | "medium" | "low"
  weatherAvailability: "not_applicable" | "available" | "partial" | "missing"
  weatherStatus: string
  locationName?: string
  missingData: string[]
  disclaimer: string
  workouts: Array<{
    workoutId: string
    name?: string
    durationHours: number
    lowDurationHours: number
    highDurationHours: number
    durationSource: "planned" | "estimated_range" | "sport_default"
    replacementLitres: number
    sweatRateLitresPerHour: number
    estimatedSweatLossLitres: number
    recommendedDrinkRateLitresPerHour: number
    recommendedDrinkLitres: number
    isHighSweatRate: boolean
    sodiumMilligramsPerLitreLow?: number
    sodiumMilligramsPerLitreHigh?: number
    sweatRateConfidence: "high" | "medium" | "low"
    source: "personal" | "population"
    matchedTests: number
    weatherAdjustmentFactor: number
    guidance: string
    weather?: {
      apparentTemperatureC: number
      relativeHumidityPercent: number
    }
    notes: string[]
  }>
}

export function HydrationTargetView({
  plan,
}: {
  plan: HydrationPlanView | undefined
}) {
  if (!plan) {
    return (
      <section
        className="hydration-detail loading-hydration"
        aria-live="polite"
      >
        <RefreshCw className="spin" /> Loading hydration target...
      </section>
    )
  }
  return (
    <section
      className="hydration-detail"
      aria-labelledby="hydration-detail-title"
    >
      <div className="hydration-total">
        <span className="hydration-orb" aria-hidden="true">
          <Droplets />
        </span>
        <div>
          <SectionLabel>Hydration detail</SectionLabel>
          <h2 id="hydration-detail-title">
            {plan.displayTargetLitres.toFixed(1)} L{" "}
            <small>total beverages today</small>
          </h2>
          <p>
            Likely range {plan.displayLowLitres.toFixed(1)}–
            {plan.displayHighLitres.toFixed(1)} L
          </p>
          <p>
            Workout drinking counts toward this total; it is not added again on
            top of the daily baseline.
          </p>
        </div>
        <div className="confidence-summary">
          <span className="confidence-badge confidence-high">
            Baseline {plan.baselineConfidence}
          </span>
          <span
            className={`confidence-badge confidence-${plan.sweatRateConfidence}`}
          >
            Sweat rate {plan.sweatRateConfidence.replace("_", " ")}
          </span>
          <span className="confidence-badge">
            Weather {plan.weatherAvailability.replace("_", " ")}
          </span>
        </div>
      </div>
      <dl className="hydration-breakdown">
        <div>
          <dt>Daily beverage baseline</dt>
          <dd>{plan.baselineLitres.toFixed(1)} L</dd>
        </div>
        <div>
          <dt>
            Recommended workout drinking (≤
            {plan.maxDrinkRateLitresPerHour.toFixed(2)} L/h)
          </dt>
          <dd>{plan.workoutReplacementLitres.toFixed(1)} L, included</dd>
        </div>
        <div>
          <dt>Conditions</dt>
          <dd>
            {plan.locationName
              ? `${plan.locationName} · ${plan.weatherStatus}`
              : "Weather-free estimate"}
          </dd>
        </div>
      </dl>
      {plan.workouts.length > 0 ? (
        <div className="hydration-workouts">
          {plan.workouts.map((workout) => (
            <article key={workout.workoutId}>
              <div>
                <strong>{workout.name ?? "Planned workout"}</strong>
                <span>
                  {workout.durationSource === "planned" ? "" : "~"}
                  {workout.durationHours.toFixed(1)} h
                  {workout.durationSource === "planned"
                    ? ""
                    : ` (estimated ${workout.lowDurationHours.toFixed(1)}–${workout.highDurationHours.toFixed(1)} h)`}{" "}
                  · sweat loss {workout.sweatRateLitresPerHour.toFixed(2)} L/h ·{" "}
                  {workout.source === "personal"
                    ? `${workout.matchedTests} personal test${workout.matchedTests === 1 ? "" : "s"}`
                    : "population estimate"}
                </span>
              </div>
              <b>
                Drink up to{" "}
                {workout.recommendedDrinkRateLitresPerHour.toFixed(2)} L/h ·{" "}
                {workout.recommendedDrinkLitres.toFixed(1)} L{" "}
                {workout.durationSource === "planned" ? "planned" : "estimated"}
              </b>
              <small>
                Estimated sweat loss{" "}
                {workout.estimatedSweatLossLitres.toFixed(1)} L
              </small>
              {workout.weather ? (
                <small>
                  {Math.round(workout.weather.apparentTemperatureC)}°C apparent
                  · {Math.round(workout.weather.relativeHumidityPercent)}%
                  humidity
                </small>
              ) : null}
              <p>{workout.guidance}</p>
              {workout.notes.map((note) => (
                <small key={note}>{note}</small>
              ))}
            </article>
          ))}
        </div>
      ) : (
        <p className="hydration-rest-day">
          No timed workout contributes planned drinking today. The target is
          your daily beverage baseline.
        </p>
      )}
      {plan.missingData.length > 0 ? (
        <ul className="hydration-notes">
          {plan.missingData.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <p className="clinical-note">{plan.disclaimer}</p>
    </section>
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
