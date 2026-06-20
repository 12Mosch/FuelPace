import { useConvexAuth, useMutation } from "convex/react"
import { useEffect, useRef } from "react"
import { api } from "../../convex/_generated/api"

export function IntervalsSyncBootstrap() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const requestSync = useMutation(api.intervals.requestSync)
  const requested = useRef(false)

  useEffect(() => {
    if (isLoading || !isAuthenticated || requested.current) return
    requested.current = true
    void requestSync({}).catch(() => {
      // Startup refreshes are best-effort and must not block application use.
    })
  }, [isAuthenticated, isLoading, requestSync])

  return null
}
