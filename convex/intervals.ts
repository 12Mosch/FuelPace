import { ConvexError, v } from "convex/values"
import { internal } from "./_generated/api"
import { action, internalMutation, mutation, query } from "./_generated/server"

const connectionSummary = v.object({
  athleteId: v.string(),
  athleteName: v.string(),
  connectedAt: v.number(),
  updatedAt: v.number(),
})

type ConnectionSummary = {
  athleteId: string
  athleteName: string
  connectedAt: number
  updatedAt: number
}

type EncryptedConnection = Omit<
  ConnectionSummary,
  "connectedAt" | "updatedAt"
> & {
  encryptedApiKey: string
  encryptionIv: string
  encryptionVersion: "aes-256-gcm-v1"
}

async function requireOwner(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> }
}) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Not authenticated")
  return identity.tokenIdentifier
}

function summarize(connection: {
  athleteId: string
  athleteName: string
  connectedAt: number
  updatedAt: number
}) {
  return {
    athleteId: connection.athleteId,
    athleteName: connection.athleteName,
    connectedAt: connection.connectedAt,
    updatedAt: connection.updatedAt,
  }
}

export const getConnection = query({
  args: {},
  returns: v.union(connectionSummary, v.null()),
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const connection = await ctx.db
      .query("intervalsConnections")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()
    return connection ? summarize(connection) : null
  },
})

export const connectWithApiKey = action({
  args: { apiKey: v.string() },
  returns: connectionSummary,
  handler: async (ctx, { apiKey }): Promise<ConnectionSummary> => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const trimmedApiKey = apiKey.trim()
    if (!trimmedApiKey) {
      throw new ConvexError({ code: "INVALID_API_KEY" })
    }
    const credential: EncryptedConnection = await ctx.runAction(
      internal.intervalsNode.validateAndEncrypt,
      { apiKey: trimmedApiKey },
    )
    return await ctx.runMutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier,
      ...credential,
    })
  },
})

export const upsertConnection = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    athleteId: v.string(),
    athleteName: v.string(),
    encryptedApiKey: v.string(),
    encryptionIv: v.string(),
    encryptionVersion: v.literal("aes-256-gcm-v1"),
  },
  returns: connectionSummary,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("intervalsConnections")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier),
      )
      .unique()
    const now = Date.now()
    const connectedAt = existing?.connectedAt ?? now
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, connectedAt, updatedAt: now })
    } else {
      await ctx.db.insert("intervalsConnections", {
        ...args,
        connectedAt,
        updatedAt: now,
      })
    }
    return summarize({ ...args, connectedAt, updatedAt: now })
  },
})

export const disconnect = mutation({
  args: {},
  returns: v.object({ disconnected: v.boolean() }),
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    const connection = await ctx.db
      .query("intervalsConnections")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
      )
      .unique()
    if (connection) await ctx.db.delete(connection._id)
    return { disconnected: true }
  },
})
