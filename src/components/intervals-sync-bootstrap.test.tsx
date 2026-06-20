// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, test, vi } from "vitest"

const requestSync = vi.fn().mockResolvedValue("scheduled")
const auth = { isAuthenticated: false, isLoading: true }

vi.mock("convex/react", () => ({
  useConvexAuth: () => auth,
  useMutation: () => requestSync,
}))

import { IntervalsSyncBootstrap } from "./intervals-sync-bootstrap"

describe("IntervalsSyncBootstrap", () => {
  afterEach(() => {
    requestSync.mockClear()
    auth.isAuthenticated = false
    auth.isLoading = true
  })

  test("requests once when authentication becomes ready", async () => {
    const view = render(<IntervalsSyncBootstrap />)
    expect(requestSync).not.toHaveBeenCalled()
    auth.isAuthenticated = true
    auth.isLoading = false
    view.rerender(<IntervalsSyncBootstrap />)
    await waitFor(() => expect(requestSync).toHaveBeenCalledTimes(1))
    view.rerender(<IntervalsSyncBootstrap />)
    await waitFor(() => expect(requestSync).toHaveBeenCalledTimes(1))
  })

  test("does not request a sync during SSR", () => {
    auth.isAuthenticated = true
    auth.isLoading = false
    expect(renderToString(<IntervalsSyncBootstrap />)).toBe("")
    expect(requestSync).not.toHaveBeenCalled()
  })
})
