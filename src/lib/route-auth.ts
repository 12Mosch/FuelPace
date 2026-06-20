import { redirect } from "@tanstack/react-router"

export function requireRouteUser(user: unknown, returnPathname: string) {
  if (!user) {
    throw redirect({
      href: `/api/auth/sign-in?returnPathname=${returnPathname}`,
    })
  }
}
