import { createFileRoute } from "@tanstack/react-router"
import { getSignUpUrl } from "@workos/authkit-tanstack-react-start"

export const Route = createFileRoute("/api/auth/sign-up")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const returnPathname = new URL(request.url).searchParams.get(
          "returnPathname",
        )
        const url = await getSignUpUrl(
          returnPathname ? { data: { returnPathname } } : undefined,
        )
        return new Response(null, { status: 307, headers: { Location: url } })
      },
    },
  },
})
