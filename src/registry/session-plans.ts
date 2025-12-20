import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"

export interface SessionPlanEntry {
  plan: string
  createdAt: string
  status: "created" | "reviewed" | "executed" | "failed"
}

export type SessionPlanRegistry = Record<string, SessionPlanEntry>

const REGISTRY_FILENAME = ".session-plans.json"

function getRegistryPath(directory: string): string {
  return join(directory, ".ai", REGISTRY_FILENAME)
}

function getRegistryTempPath(directory: string): string {
  return join(directory, ".ai", `${REGISTRY_FILENAME}.tmp`)
}

/**
 * Extract the session key (first 7 chars) from a full session ID.
 * Collision probability: ~1 in 268M for hex IDs.
 * If collisions become an issue, increase to 12 chars.
 */
function getSessionKey(sessionID: string): string {
  return sessionID.slice(0, 7)
}

export async function readRegistry(
  directory: string,
): Promise<SessionPlanRegistry> {
  const registryPath = getRegistryPath(directory)
  try {
    const raw = await readFile(registryPath, "utf8")
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") {
      return {}
    }
    return parsed as SessionPlanRegistry
  } catch {
    return {}
  }
}

export async function writeRegistry(
  directory: string,
  registry: SessionPlanRegistry,
): Promise<void> {
  const aiDir = join(directory, ".ai")
  await mkdir(aiDir, { recursive: true })

  const registryPath = getRegistryPath(directory)
  const tempPath = getRegistryTempPath(directory)
  const payload = JSON.stringify(registry, null, 2)

  await writeFile(tempPath, payload, "utf8")
  await rename(tempPath, registryPath)
}

/**
 * Register a plan for the given session. Uses a read-modify-write pattern.
 *
 * NOTE: This is not atomic at the application level. In concurrent scenarios
 * (e.g. multiple OpenCode instances sharing the same project directory),
 * the last write wins. Given OpenCode's single-process architecture per project,
 * this is rare but possible. For v2, consider file-based locking or event-sourced updates.
 */
export async function registerPlan(
  directory: string,
  sessionID: string,
  planName: string,
): Promise<void> {
  const registry = await readRegistry(directory)
  const sessionKey = getSessionKey(sessionID)

  registry[sessionKey] = {
    plan: planName,
    createdAt: new Date().toISOString(),
    status: "created",
  }

  await writeRegistry(directory, registry)
}

export async function lookupPlan(
  directory: string,
  sessionID: string,
): Promise<SessionPlanEntry | null> {
  const registry = await readRegistry(directory)
  const sessionKey = getSessionKey(sessionID)
  const entry = registry[sessionKey]

  if (!entry) {
    return null
  }

  const planPath = join(directory, ".ai", `plan-${entry.plan}.md`)
  try {
    await access(planPath)
    return entry
  } catch {
    return null
  }
}

export async function updatePlanStatus(
  directory: string,
  sessionID: string,
  status: SessionPlanEntry["status"],
): Promise<void> {
  const registry = await readRegistry(directory)
  const sessionKey = getSessionKey(sessionID)
  const entry = registry[sessionKey]

  if (!entry) {
    return
  }

  registry[sessionKey] = { ...entry, status }
  await writeRegistry(directory, registry)
}

export async function listPlans(
  directory: string,
): Promise<
  Array<SessionPlanEntry & { sessionKey: string; fileExists: boolean }>
> {
  const registry = await readRegistry(directory)
  const results: Array<
    SessionPlanEntry & { sessionKey: string; fileExists: boolean }
  > = []

  for (const [sessionKey, entry] of Object.entries(registry)) {
    const planPath = join(directory, ".ai", `plan-${entry.plan}.md`)
    let fileExists = true
    try {
      await access(planPath)
    } catch {
      fileExists = false
    }

    results.push({ ...entry, sessionKey, fileExists })
  }

  return results
}

export async function findClosestPlan(
  directory: string,
  partial: string,
): Promise<{ plan: string; entry: SessionPlanEntry | null } | null> {
  const aiDir = join(directory, ".ai")
  let entries: string[]
  try {
    entries = await readdir(aiDir)
  } catch {
    return null
  }

  const planFiles = entries
    .filter((file) => file.startsWith("plan-") && file.endsWith(".md"))
    .map((file) => file.slice(5, -3))

  const lowerPartial = partial.toLowerCase()
  const prefixMatches = planFiles.filter((name) =>
    name.toLowerCase().startsWith(lowerPartial),
  )

  let matchedPlan: string | null = null

  if (prefixMatches.length === 1) {
    matchedPlan = prefixMatches[0]
  } else {
    const substringMatches = planFiles.filter((name) =>
      name.toLowerCase().includes(lowerPartial),
    )
    if (substringMatches.length === 1) {
      matchedPlan = substringMatches[0]
    }
  }

  if (!matchedPlan) {
    return null
  }

  const registry = await readRegistry(directory)
  const entry = Object.values(registry).find((value) => value.plan === matchedPlan) ?? null

  return { plan: matchedPlan, entry }
}
