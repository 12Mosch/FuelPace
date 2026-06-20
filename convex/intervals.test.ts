/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, test } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"])
const identityA = { subject: "user-a", tokenIdentifier: "workos|user-a" }
const identityB = { subject: "user-b", tokenIdentifier: "workos|user-b" }

const credential = {
  athleteId: "athlete-1",
  athleteName: "Ada Rider",
  encryptedApiKey: "ciphertext",
  encryptionIv: "iv",
  encryptionVersion: "aes-256-gcm-v1" as const,
}

describe("Intervals connections", () => {
  test("rejects unauthenticated public functions before data access", async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.intervals.getConnection, {})).rejects.toThrow(
      "Not authenticated",
    )
    await expect(t.mutation(api.intervals.disconnect, {})).rejects.toThrow(
      "Not authenticated",
    )
    await expect(
      t.action(api.intervals.connectWithApiKey, { apiKey: "unused" }),
    ).rejects.toThrow("Not authenticated")
  })

  test("returns a non-secret summary scoped to the authenticated owner", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
    })

    const result = await t
      .withIdentity(identityA)
      .query(api.intervals.getConnection, {})
    expect(result).toMatchObject({
      athleteId: "athlete-1",
      athleteName: "Ada Rider",
    })
    expect(result).not.toHaveProperty("encryptedApiKey")
    expect(result).not.toHaveProperty("encryptionIv")
    expect(
      await t.withIdentity(identityB).query(api.intervals.getConnection, {}),
    ).toBeNull()
  })

  test("reconnect atomically replaces one existing connection", async () => {
    const t = convexTest(schema, modules)
    const first = await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
    })
    const second = await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
      athleteId: "athlete-2",
      athleteName: "New Name",
      encryptedApiKey: "new-ciphertext",
    })

    expect(second.connectedAt).toBe(first.connectedAt)
    expect(second.athleteId).toBe("athlete-2")
    const documents = await t.run((ctx) =>
      ctx.db.query("intervalsConnections").collect(),
    )
    expect(documents).toHaveLength(1)
    expect(documents[0]?.encryptedApiKey).toBe("new-ciphertext")
  })

  test("disconnect is owner-scoped and idempotent", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityA.tokenIdentifier,
      ...credential,
    })
    await t.mutation(internal.intervals.upsertConnection, {
      ownerTokenIdentifier: identityB.tokenIdentifier,
      ...credential,
      athleteId: "athlete-b",
    })

    expect(
      await t.withIdentity(identityA).mutation(api.intervals.disconnect, {}),
    ).toEqual({
      disconnected: true,
    })
    expect(
      await t.withIdentity(identityA).mutation(api.intervals.disconnect, {}),
    ).toEqual({
      disconnected: true,
    })
    expect(
      await t.withIdentity(identityB).query(api.intervals.getConnection, {}),
    ).not.toBeNull()
  })
})
