import { createFileRoute } from "@tanstack/react-router"
import { setCookie } from "@tanstack/react-start/server"
import { getAuth, getSignInUrl } from "@workos/authkit-tanstack-react-start"
import {
  buildIntervalsAuthorizationUrl,
  createOAuthState,
  oauthCookieName,
  oauthCookieOptions,
  requireIntervalsServerConfig,
} from "../../../../server/intervalsOAuth"

export const Route = createFileRoute("/api/integrations/intervals/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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

        const config = requireIntervalsServerConfig()
        const state = createOAuthState()
        const isHttps = new URL(request.url).protocol === "https:"
        setCookie(oauthCookieName(isHttps), state, oauthCookieOptions(isHttps))
        return new Response(null, {
          status: 302,
          headers: {
            Location: buildIntervalsAuthorizationUrl({ ...config, state }),
          },
        })
      },
    },
  },
})
