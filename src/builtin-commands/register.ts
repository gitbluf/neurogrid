// src/builtin-commands/register.ts
import type { BuiltinCommand } from "./types";
import { createBuiltinCommands } from "./commands";

export async function registerBuiltinCommands(
	config: Record<string, unknown>,
): Promise<void> {
	const existingCommands =
		(config.command as Record<string, unknown> | undefined) ?? {};

	const builtinCommands: BuiltinCommand[] = createBuiltinCommands();

	for (const cmd of builtinCommands) {
		// Do not override user-defined commands with the same name
		if (existingCommands[cmd.name]) continue;

		existingCommands[cmd.name] = {
			template: cmd.template,
			description: cmd.description,
			...(cmd.agent ? { agent: cmd.agent } : {}),
			...(cmd.model ? { model: cmd.model } : {}),
			...(typeof cmd.subtask === "boolean" ? { subtask: cmd.subtask } : {}),
		};
	}

	(config as { command?: Record<string, unknown> }).command = existingCommands;
}
