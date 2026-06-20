import { v } from "convex/values"
import { internal } from "./_generated/api"
import { action, internalMutation, mutation, query } from "./_generated/server"

const connectionSummary = v.object({
  athleteId: v.string(),
  athleteName: v.string(),
  grantedScopes: v.array(v.string()),
  connectedAt: v.number(),
  updatedAt: v.number(),
})

type ConnectionSummary = {
  athleteId: string
  athleteName: string
  grantedScopes: string[]
  connectedAt: number
  updatedAt: number
}

type EncryptedConnection = Omit<
  ConnectionSummary,
  "connectedAt" | "updatedAt"
> & {
  encryptedAccessToken: string
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
  grantedScopes: string[]
  connectedAt: number
  updatedAt: number
}) {
  return {
    athleteId: connection.athleteId,
    athleteName: connection.athleteName,
    grantedScopes: connection.grantedScopes,
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

export const completeOAuth = action({
  args: { code: v.string() },
  returns: connectionSummary,
  handler: async (ctx, { code }): Promise<ConnectionSummary> => {
    const ownerTokenIdentifier = await requireOwner(ctx)
    if (!code.trim()) throw new Error("Missing authorization code")
    const credential: EncryptedConnection = await ctx.runAction(
      internal.intervalsNode.exchangeAndEncrypt,
      { code },
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
    encryptedAccessToken: v.string(),
    encryptionIv: v.string(),
    encryptionVersion: v.literal("aes-256-gcm-v1"),
    grantedScopes: v.array(v.string()),
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
