import type {
  createOpencodeClient,
  Event,
  UserMessage,
  Part,
} from "@opencode-ai/sdk"

/**
 * Event hook type matching the plugin's Hooks["event"] signature.
 * Kept for backward compatibility.
 */
export type EventHook = (input: { event: Event }) => Promise<void>

/**
 * Type for the "chat.message" hook that shows an agent-branded toast.
 */
export type ChatMessageToastHook = (
  input: {
    sessionID: string
    agent?: string
    model?: { providerID: string; modelID: string }
    messageID?: string
    variant?: string
  },
  output: {
    message: UserMessage
    parts: Part[]
  },
) => Promise<void>

/**
 * Creates an event hook for session creation.
 *
 * This is a no-op stub kept for backward compatibility. The branded toast
 * is now shown via the chat.message hook (see createChatMessageToastHook)
 * which has access to the agent name.
 */
export function createSessionToastHook(
  _client: ReturnType<typeof createOpencodeClient>,
): EventHook {
  return async ({ event }) => {
    if (event.type !== "session.created") return
    // Toast moved to chat.message hook for dynamic agent name support.
  }
}

/** Tracks sessions that have already shown the welcome toast. */
const toastedSessions = new Set<string>()

/**
 * Creates a "chat.message" hook that shows a branded toast with the agent name
 * on the first message of each session.
 *
 * Uses a Set to ensure the toast fires only once per session.
 * Falls back to a generic message when the agent name is unavailable.
 */
export function createChatMessageToastHook(
  client: ReturnType<typeof createOpencodeClient>,
): ChatMessageToastHook {
  return async (input, _output) => {
    if (toastedSessions.has(input.sessionID)) return
    toastedSessions.add(input.sessionID)

    const agentLabel = input.agent?.toUpperCase() ?? "UNKNOWN"

    await client.tui.showToast({
      body: {
        title: `⚡ KERNEL-92 // ${agentLabel}`,
        message: `Neural link established. ${agentLabel} online.`,
        variant: "info",
        duration: 3000,
      },
    })
  }
}
