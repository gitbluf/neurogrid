import { access, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { CommandExecuteBeforeHook } from "./types";
import { createTextPart } from "./types";

/**
 * Creates the "command.execute.before" handler for the `/clean` command.
 * Deletes all .md files from the .ai/ directory.
 */
export function createCommandCleanHook(
	directory: string,
): CommandExecuteBeforeHook {
	return async (input, output) => {
		if (input.command !== "clean") return;

		const aiDir = join(directory, ".ai");
		const deleted: string[] = [];
		const errors: string[] = [];

		try {
			await access(aiDir);
		} catch {
			output.parts.push(
				createTextPart("No `.ai/` directory found — nothing to clean."),
			);
			return;
		}

		let entries: string[];
		try {
			entries = await readdir(aiDir);
		} catch (err) {
			output.parts.push(
				createTextPart(
					`Error reading .ai/ directory: ${
						err instanceof Error ? err.message : String(err)
					}`,
				),
			);
			return;
		}

		const mdFiles = entries.filter((f) => f.endsWith(".md"));
		const registryFile = ".session-plans.json";

		if (mdFiles.length === 0) {
			const registryPath = join(aiDir, registryFile);
			try {
				await unlink(registryPath);
				output.parts.push(
					createTextPart(
						"No `.md` files found in `.ai/`. Removed session-plan registry.",
					),
				);
			} catch {
				output.parts.push(
					createTextPart("No `.md` files found in `.ai/` — nothing to clean."),
				);
			}
			return;
		}

		for (const file of mdFiles) {
			const filePath = join(aiDir, file);
			try {
				await unlink(filePath);
				deleted.push(file);
			} catch (err) {
				errors.push(
					`Failed to delete ${file}: ${
						err instanceof Error ? err.message : String(err)
					}`,
				);
			}
		}

		const registryPath = join(aiDir, registryFile);
		try {
			await unlink(registryPath);
		} catch {
			// Ignore missing registry
		}

		const lines: string[] = [];
		if (deleted.length > 0) {
			lines.push(`Deleted ${deleted.length} file(s) from .ai/:`);
			for (const f of deleted) {
				lines.push(`  - ${f}`);
			}
		}

		lines.push(
			"Deleted session-plan registry (.session-plans.json) if present.",
		);
		if (errors.length > 0) {
			lines.push("");
			lines.push(`Errors (${errors.length}):`);
			for (const e of errors) {
				lines.push(`  - ${e}`);
			}
		}

		output.parts.push(createTextPart(lines.join("\n")));
	};
}
