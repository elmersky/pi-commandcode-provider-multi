import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import { getConfiguredApiKey, getConfiguredApiKeys } from "../src/api-key.ts"

async function withAuthFile(
  value: unknown,
  run: (authPath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "pi-commandcode-auth-"))
  const authPath = join(directory, "auth.json")
  try {
    await writeFile(authPath, JSON.stringify(value), "utf-8")
    await run(authPath)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe("getConfiguredApiKey()", () => {
  it("prefers the official environment variable and keeps the legacy alias", () => {
    assert.equal(
      getConfiguredApiKey({
        env: { COMMAND_CODE_API_KEY: "official-key", COMMANDCODE_API_KEY: "legacy-key" },
        authPaths: [],
      }),
      "official-key",
    )
    assert.equal(
      getConfiguredApiKey({ env: { COMMANDCODE_API_KEY: "legacy-key" }, authPaths: [] }),
      "legacy-key",
    )
  })

  it("reads pi OAuth and API credentials", async () => {
    const cases: readonly { credential: unknown; expected: string }[] = [
      {
        credential: { commandcode: { type: "oauth", access: "oauth-key" } },
        expected: "oauth-key",
      },
      { credential: { commandcode: { type: "api", key: "api-key" } }, expected: "api-key" },
      { credential: { "command-code": { type: "api", key: "cli-key" } }, expected: "cli-key" },
      { credential: { apiKey: "legacy-key" }, expected: "legacy-key" },
    ]

    for (const testCase of cases) {
      await withAuthFile(testCase.credential, async (authPath) => {
        assert.equal(getConfiguredApiKey({ env: {}, authPaths: [authPath] }), testCase.expected)
      })
    }
  })

  it("reads multiple keys from env and account arrays", async () => {
    assert.deepEqual(
      getConfiguredApiKeys({
        env: {
          COMMAND_CODE_API_KEYS: "env-key-1, env-key-2",
          COMMAND_CODE_API_KEY_3: "env-key-3",
        },
        authPaths: [],
      }),
      ["env-key-1", "env-key-2", "env-key-3"],
    )

    await withAuthFile(
      {
        accounts: [
          { apiKey: "account-key-1" },
          { key: "account-key-2" },
          { apiKeyEnv: "COMMAND_CODE_ACCOUNT_3" },
        ],
      },
      async (authPath) => {
        assert.deepEqual(
          getConfiguredApiKeys({
            env: { COMMAND_CODE_ACCOUNT_3: "account-key-3" },
            authPaths: [authPath],
          }),
          ["account-key-1", "account-key-2", "account-key-3"],
        )
      },
    )
  })

  it("ignores malformed files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-commandcode-auth-"))
    const authPath = join(directory, "auth.json")
    try {
      await writeFile(authPath, "not json", "utf-8")
      assert.equal(getConfiguredApiKey({ env: {}, authPaths: [authPath] }), undefined)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
