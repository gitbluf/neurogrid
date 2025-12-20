import { readdir } from "node:fs/promises"
import { join } from "node:path"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import type { CommandExecuteBeforeHook } from "./types"
import { createTextPart } from "./types"
import { readRegistry } from "../registry"

export function createCommandPlansHook(
  directory: string,
  client: ReturnType<typeof createOpencodeClient>,
): CommandExecuteBeforeHook {
  return async (input, output) => {
    if (input.command !== "plans") return

    const aiDir = join(directory, ".ai")
    const registry = await readRegistry(directory)

    let entries: string[]
    try {
      entries = await readdir(aiDir)
    } catch {
      output.parts.push(
        createTextPart("No `.ai/` directory found. No plans exist yet."),
      )
      client.tui.showToast({
        body: {
          title: "Plans",
          message: "No .ai/ directory found. No plans exist yet.",
          variant: "warning",
          duration: 3000,
        },
      })
      return
    }

    const planFiles = entries
      .filter((file) => file.startsWith("plan-") && file.endsWith(".md"))
      .map((file) => file.slice(5, -3))

    if (planFiles.length === 0) {
      output.parts.push(createTextPart("No plan files found in `.ai/`."))
      client.tui.showToast({
        body: {
          title: "Plans",
          message: "No plan files found in .ai/.",
          variant: "info",
          duration: 3000,
        },
      })
      return
    }

    const statusByPlan: Record<
      string,
      { status: string; session: string; createdAt: string }
    > = {}
    for (const [sessionKey, entry] of Object.entries(registry)) {
      statusByPlan[entry.plan] = {
        status: entry.status,
        session: sessionKey,
        createdAt: entry.createdAt,
      }
    }

    const lines: string[] = ["## Plans\n"]
    lines.push("| Plan | Status | Session | Created |")
    lines.push("|------|--------|---------|---------|")

    const statusCounts: Record<string, number> = {}

    for (const plan of planFiles.sort()) {
      const info = statusByPlan[plan]
      const status = info?.status ?? "untracked"
      const session = info?.session ?? "—"
      const created = info?.createdAt
        ? new Date(info.createdAt).toLocaleDateString()
        : "—"
      lines.push(`| ${plan} | ${status} | ${session} | ${created} |`)
      statusCounts[status] = (statusCounts[status] ?? 0) + 1
    }

    output.parts.push(createTextPart(lines.join("\n")))

    const summaryParts = Object.entries(statusCounts)
      .map(([status, count]) => `${count} ${status}`)
      .join(", ")
    client.tui.showToast({
      body: {
        title: "Plans",
        message: `📋 ${planFiles.length} plans found — ${summaryParts}`,
        variant: "info",
        duration: 5000,
      },
    })
  }
}
