import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  intervalsConnections: defineTable({
    ownerTokenIdentifier: v.string(),
    athleteId: v.string(),
    athleteName: v.string(),
    encryptedAccessToken: v.string(),
    encryptionIv: v.string(),
    encryptionVersion: v.literal("aes-256-gcm-v1"),
    grantedScopes: v.array(v.string()),
    connectedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerTokenIdentifier", ["ownerTokenIdentifier"]),
})
