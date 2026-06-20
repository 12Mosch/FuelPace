import { query } from "./_generated/server"

export const viewer = query({
  args: {},
  handler: async (context) => {
    const identity = await context.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    return {
      subject: identity.subject,
      email: identity.email,
    }
  },
})
