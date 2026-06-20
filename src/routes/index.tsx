import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useAuth } from "@workos/authkit-tanstack-react-start/client"
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react"
import { api } from "../../convex/_generated/api"

export const Route = createFileRoute("/")({ component: Home })

function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <header>
        <h1 className="text-4xl font-bold">FuelPace</h1>
        <p className="mt-3 text-lg">Convex and WorkOS AuthKit are connected.</p>
      </header>
      <AuthLoading>
        <p>Loading your session...</p>
      </AuthLoading>
      <Authenticated>
        <SignedIn />
      </Authenticated>
      <Unauthenticated>
        <SignedOut />
      </Unauthenticated>
    </main>
  )
}

function SignedIn() {
  const { signOut, user } = useAuth()
  const { data } = useSuspenseQuery(convexQuery(api.auth.viewer, {}))

  return (
    <section className="flex flex-col items-start gap-4">
      <p>
        Signed in as{" "}
        <strong>{user?.email ?? data.email ?? data.subject}</strong>
      </p>
      <button
        className="rounded bg-black px-4 py-2 text-white"
        onClick={() => signOut()}
        type="button"
      >
        Sign out
      </button>
    </section>
  )
}

function SignedOut() {
  return (
    <section className="flex gap-3">
      <a
        className="rounded bg-black px-4 py-2 text-white"
        href="/api/auth/sign-in"
      >
        Sign in
      </a>
      <a
        className="rounded border border-black px-4 py-2"
        href="/api/auth/sign-up"
      >
        Sign up
      </a>
    </section>
  )
}
