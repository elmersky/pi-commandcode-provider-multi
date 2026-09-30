import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { CommandCodeAccountPool } from "../src/accounts.ts"

describe("CommandCodeAccountPool", () => {
  it("keeps the active account until it is rejected", () => {
    const pool = new CommandCodeAccountPool({ now: () => 1_000 })
    assert.equal(pool.resolve(["first", "second"]), "first")
    pool.reject("first", "rate-limit")
    assert.equal(pool.resolve(["first", "second"]), "second")
  })

  it("disables invalid credentials without affecting other accounts", () => {
    const pool = new CommandCodeAccountPool({ now: () => 1_000 })
    pool.reject("first", "invalid-credential")
    assert.equal(pool.resolve(["first", "second"]), "second")
    assert.equal(pool.resolve(["first"]), undefined)
  })

  it("restores a rate-limited account after its cooldown", () => {
    let now = 1_000
    const pool = new CommandCodeAccountPool({ now: () => now, cooldownMs: 100 })
    pool.reject("first", "rate-limit")
    assert.equal(pool.resolve(["first", "second"]), "second")
    now = 1_101
    assert.equal(pool.resolve(["first", "second"]), "first")
  })

  it("round-robins healthy accounts", () => {
    const pool = new CommandCodeAccountPool({ mode: "round-robin" })
    assert.equal(pool.resolve(["first", "second"]), "first")
    assert.equal(pool.resolve(["first", "second"]), "second")
    assert.equal(pool.resolve(["first", "second"]), "first")
  })
})
