export type AccountRotationMode = "failover" | "round-robin"
export type AccountRejection = "rate-limit" | "invalid-credential"

interface AccountState {
  kind: AccountRejection
  until: number
}

export interface AccountPoolOptions {
  mode?: AccountRotationMode
  cooldownMs?: number
  now?: () => number
}

function uniqueKeys(keys: readonly string[]): string[] {
  return [...new Set(keys.map((key) => key.trim()).filter(Boolean))]
}

export class CommandCodeAccountPool {
  private readonly mode: AccountRotationMode
  private readonly cooldownMs: number
  private readonly now: () => number
  private readonly states = new Map<string, AccountState>()
  private cursor = 0

  constructor(options: AccountPoolOptions = {}) {
    this.mode = options.mode ?? "failover"
    this.cooldownMs = options.cooldownMs ?? 60_000
    this.now = options.now ?? Date.now
  }

  resolve(keys: readonly string[], tried: ReadonlySet<string> = new Set()): string | undefined {
    const available = uniqueKeys(keys).filter((key) => {
      if (tried.has(key)) return false
      const state = this.states.get(key)
      if (state?.kind === "invalid-credential") return false
      return state === undefined || state.until <= this.now()
    })
    if (available.length === 0) return undefined

    if (this.mode === "failover") return available[0]

    const normalized = uniqueKeys(keys)
    for (let offset = 0; offset < normalized.length; offset += 1) {
      const index = (this.cursor + offset) % normalized.length
      const key = normalized[index]
      if (available.includes(key)) {
        this.cursor = (index + 1) % normalized.length
        return key
      }
    }
    return available[0]
  }

  reject(key: string, reason: AccountRejection, resetAtMs?: number): void {
    const until =
      reason === "invalid-credential"
        ? Number.POSITIVE_INFINITY
        : (resetAtMs ?? this.now() + this.cooldownMs)
    this.states.set(key, { kind: reason, until })
  }

  state(key: string): { kind: AccountRejection; until: number } | undefined {
    return this.states.get(key)
  }
}

export function parseAccountRotationMode(value: string | undefined): AccountRotationMode {
  return value?.trim().toLowerCase() === "round-robin" ? "round-robin" : "failover"
}
