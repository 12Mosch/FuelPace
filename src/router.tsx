import { ConvexQueryClient } from "@convex-dev/react-query"
import { QueryClient } from "@tanstack/react-query"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import {
  AuthKitProvider,
  useAccessToken,
  useAuth,
} from "@workos/authkit-tanstack-react-start/client"
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react"
import { useCallback, useMemo } from "react"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL
  if (!convexUrl) {
    throw new Error("Missing VITE_CONVEX_URL environment variable")
  }

  const convexClient = new ConvexReactClient(convexUrl)
  const convexQueryClient = new ConvexQueryClient(convexClient)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  })
  convexQueryClient.connect(queryClient)

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    context: { convexQueryClient, queryClient },
    InnerWrap: ({ children }) => (
      <AuthKitProvider>
        <ConvexProviderWithAuth
          client={convexClient}
          useAuth={useAuthFromWorkOS}
        >
          {children}
        </ConvexProviderWithAuth>
      </AuthKitProvider>
    ),
  })

  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

function useAuthFromWorkOS() {
  const { loading, user } = useAuth()
  const { getAccessToken, refresh } = useAccessToken()

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!user) return null
      return forceRefreshToken
        ? ((await refresh()) ?? null)
        : ((await getAccessToken()) ?? null)
    },
    [getAccessToken, refresh, user],
  )

  return useMemo(
    () => ({
      isLoading: loading,
      isAuthenticated: Boolean(user),
      fetchAccessToken,
    }),
    [fetchAccessToken, loading, user],
  )
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
