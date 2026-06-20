import { createFileRoute } from "@tanstack/react-router"
import { deleteCookie, getCookie } from "@tanstack/react-start/server"
import { getAuth, getSignInUrl } from "@workos/authkit-tanstack-react-start"
import { ConvexHttpClient } from "convex/browser"
import { api } from "../../../../../convex/_generated/api"
import {
  oauthCookieName,
  oauthCookieOptions,
  stateMatches,
} from "../../../../server/intervalsOAuth"

export function settingsRedirect(
  request: Request,
  outcome: "connected" | "denied" | "error",
) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(
        `/settings?intervals=${outcome}`,
        request.url,
      ).toString(),
    },
  })
}

export function parseIntervalsCallback(
  url: URL,
  expectedState: string | undefined,
): { code: string } | { outcome: "denied" | "error" } {
  if (url.searchParams.get("error") === "access_denied") {
    return { outcome: "denied" }
  }
  const code = url.searchParams.get("code")
  if (!code || !stateMatches(expectedState, url.searchParams.get("state"))) {
    return { outcome: "error" }
  }
  return { code }
}

export const Route = createFileRoute("/api/integrations/intervals/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const isHttps = url.protocol === "https:"
        const cookieName = oauthCookieName(isHttps)
        const expectedState = getCookie(cookieName)
        deleteCookie(cookieName, oauthCookieOptions(isHttps))

        const auth = await getAuth()
        if (!auth.user) {
          const signInUrl = await getSignInUrl({
            data: { returnPathname: "/settings" },
          })
          return new Response(null, {
            status: 307,
            headers: { Location: signInUrl },
          })
        }
        const callback = parseIntervalsCallback(url, expectedState)
        if ("outcome" in callback) {
          return settingsRedirect(request, callback.outcome)
        }

        try {
          const convexUrl = process.env.VITE_CONVEX_URL
          if (!convexUrl)
            throw new Error("Missing VITE_CONVEX_URL environment variable")
          const client = new ConvexHttpClient(convexUrl, {
            auth: auth.accessToken,
            logger: false,
          })
          await client.action(api.intervals.completeOAuth, {
            code: callback.code,
          })
          return settingsRedirect(request, "connected")
        } catch {
          return settingsRedirect(request, "error")
        }
      },
    },
  },
})
