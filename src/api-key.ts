import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function defaultAuthPaths(home: string): string[] {
  return [
    join(home, ".commandcode", "auth.json"),
    join(home, ".pi", "agent", "auth.json"),
    join(home, ".omp", "agent", "auth.json"),
  ]
}

function apiKeyFromCredential(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  if (stringValue(value.type) === "oauth") return stringValue(value.access)
  if (stringValue(value.type) === "api") return stringValue(value.key)
  return stringValue(value.access) ?? stringValue(value.key)
}

function splitKeys(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(/[\r\n,]+/)
    .map((key) => key.trim())
    .filter(Boolean)
}

function valuesFromAccount(value: unknown, env?: NodeJS.ProcessEnv): string[] {
  if (typeof value === "string") return [value]
  if (!isRecord(value)) return []
  const apiKeyEnv = stringValue(value.apiKeyEnv)
  return [
    stringValue(value.apiKey),
    apiKeyEnv && env?.[apiKeyEnv],
    stringValue(value.key),
    stringValue(value.access),
    apiKeyFromCredential(value.commandcode),
    apiKeyFromCredential(value["command-code"]),
  ].filter((key): key is string => Boolean(key))
}

function valuesFromAuthDocument(
  parsed: Record<string, unknown>,
  env?: NodeJS.ProcessEnv,
): string[] {
  const keys = [
    stringValue(parsed.apiKey),
    stringValue(parsed.commandcode),
    apiKeyFromCredential(parsed.commandcode),
    stringValue(parsed["command-code"]),
    apiKeyFromCredential(parsed["command-code"]),
  ].filter((key): key is string => Boolean(key))

  for (const field of ["accounts", "apiKeys", "keys"]) {
    const value = parsed[field]
    if (Array.isArray(value)) {
      for (const account of value) keys.push(...valuesFromAccount(account, env))
    }
  }
  return keys
}

function appendUnique(target: string[], values: readonly string[]): void {
  for (const value of values) {
    const key = value.trim()
    if (key && !target.includes(key)) target.push(key)
  }
}

function readKeyFile(path: string | undefined): string[] {
  if (!path || !existsSync(path)) return []
  try {
    return splitKeys(readFileSync(path, "utf-8"))
  } catch {
    return []
  }
}

export function getConfiguredApiKeys(
  options: {
    env?: NodeJS.ProcessEnv
    authPaths?: readonly string[]
    homeDir?: () => string
  } = {},
): string[] {
  const env = options.env ?? process.env
  const keys: string[] = []

  appendUnique(
    keys,
    [env.COMMAND_CODE_API_KEY, env.COMMANDCODE_API_KEY].filter((key): key is string =>
      Boolean(key),
    ),
  )
  appendUnique(keys, splitKeys(env.COMMAND_CODE_API_KEYS))
  appendUnique(keys, splitKeys(env.COMMANDCODE_API_KEYS))

  const indexed = Object.keys(env)
    .filter((name) => /^(?:COMMAND_CODE|COMMANDCODE)_API_KEY_\d+$/.test(name))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/(\d+)$/)?.[1])
      const rightNumber = Number(right.match(/(\d+)$/)?.[1])
      return leftNumber - rightNumber
    })
  appendUnique(
    keys,
    indexed.flatMap((name) => splitKeys(env[name])),
  )
  appendUnique(keys, readKeyFile(env.COMMAND_CODE_API_KEYS_FILE ?? env.COMMANDCODE_API_KEYS_FILE))

  const home = options.homeDir?.() ?? homedir()
  const authPaths = options.authPaths ?? defaultAuthPaths(home)
  for (const authPath of authPaths) {
    try {
      if (!existsSync(authPath)) continue
      const parsed: unknown = JSON.parse(readFileSync(authPath, "utf-8"))
      if (isRecord(parsed)) appendUnique(keys, valuesFromAuthDocument(parsed, env))
    } catch {
      // Ignore malformed or unreadable auth files, matching single-key behavior.
    }
  }

  const configuredAccountsFile = env.COMMAND_CODE_ACCOUNTS_FILE ?? env.COMMANDCODE_ACCOUNTS_FILE
  if (configuredAccountsFile && existsSync(configuredAccountsFile)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(configuredAccountsFile, "utf-8"))
      if (isRecord(parsed)) appendUnique(keys, valuesFromAuthDocument(parsed, env))
    } catch {
      // Ignore malformed custom account files; valid credentials remain usable.
    }
  }

  return keys
}

export function getConfiguredApiKey(
  options: {
    env?: NodeJS.ProcessEnv
    authPaths?: readonly string[]
    homeDir?: () => string
  } = {},
): string | undefined {
  return getConfiguredApiKeys(options)[0]
}
