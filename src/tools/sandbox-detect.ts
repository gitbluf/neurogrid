import { spawn } from "node:child_process"

export type SandboxBackend = "sandbox-exec" | "bwrap" | "none"

let cachedBackend: SandboxBackend | null = null

export async function detectBackend(): Promise<SandboxBackend> {
  if (cachedBackend) {
    return cachedBackend
  }

  const backend = await detectBackendUncached()
  cachedBackend = backend
  return backend
}

async function detectBackendUncached(): Promise<SandboxBackend> {
  if (process.platform === "linux") {
    if (await commandExists("bwrap")) {
      return "bwrap"
    }
  }

  if (process.platform === "darwin") {
    if (await commandExists("sandbox-exec")) {
      return "sandbox-exec"
    }
  }

  return "none"
}

async function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // ignore
      }
      resolve(false)
    }, 5_000)

    const child = spawn("command", ["-v", command], {
      shell: true,
      stdio: "ignore",
    })

    child.on("error", () => {
      clearTimeout(timeoutId)
      resolve(false)
    })
    child.on("close", (code) => {
      clearTimeout(timeoutId)
      resolve(code === 0)
    })
  })
}
