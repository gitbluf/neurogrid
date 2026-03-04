import { resolve } from "node:path";
import type { Hooks } from "@opencode-ai/plugin";

/**
 * Checks whether `targetPath` is contained within `projectDir`.
 * Resolves relative paths against `projectDir` before comparison.
 */
function isInsideProject(projectDir: string, targetPath: string): boolean {
	const resolved = resolve(projectDir, targetPath);
	const normalizedProject = projectDir.endsWith("/")
		? projectDir
		: `${projectDir}/`;
	return resolved === projectDir || resolved.startsWith(normalizedProject);
}

/**
 * Blocks grep/glob calls with path "." or paths outside the project directory.
 */
export function createToolGrepPathGuardHook(
	directory: string,
): NonNullable<Hooks["tool.execute.before"]> {
	return async (input, output) => {
		if (input.tool !== "grep" && input.tool !== "glob") {
			return;
		}

		const args = output.args as Record<string, unknown>;
		const path = (args.path as string | undefined) ?? "";

		// Allow empty/undefined path (tool default behavior)
		if (path === "") {
			return;
		}

		// Block "." — too broad, forces search from cwd root
		if (path === ".") {
			throw new Error(
				'⛔ Blocked: path "." is too broad. Use a more specific path like "src/" or, for grep, narrow with the "include" parameter.',
			);
		}

		// Block paths that escape the project directory
		if (!isInsideProject(directory, path)) {
			throw new Error(
				`⛔ Blocked: path "${path}" is outside the project directory. Only paths within the project are allowed.`,
			);
		}
	};
}
