export type SecurityProfile = "default" | "network-allow" | "readonly";

const VALID_PROFILES: ReadonlySet<string> = new Set<SecurityProfile>([
	"default",
	"network-allow",
	"readonly",
]);

/**
 * Resolve the sandbox security profile from the environment.
 *
 * Reads `OPENCODE_SANDBOX_PROFILE`. Falls back to "default" if
 * unset, empty, or invalid (with a stderr warning for invalid values).
 */
export function resolveProfile(): SecurityProfile {
	const raw = process.env.OPENCODE_SANDBOX_PROFILE;
	if (!raw) {
		return "default";
	}
	const trimmed = raw.trim();
	if (VALID_PROFILES.has(trimmed)) {
		return trimmed as SecurityProfile;
	}
	console.warn(
		`[sandbox] Invalid OPENCODE_SANDBOX_PROFILE="${raw}". ` +
			`Valid values: ${[...VALID_PROFILES].join(", ")}. Falling back to "default".`,
	);
	return "default";
}

export const ALLOWED_BASE_ENV_VARS = [
	"PATH",
	"HOME",
	"USER",
	"LANG",
	"LC_ALL",
	"TERM",
	"SHELL",
	"TMPDIR",
	"NODE_ENV",
];

/**
 * SBPL metacharacters that could enable sandbox profile injection.
 * These characters have special meaning in Sandbox Profile Language:
 * - `(` / `)` — s-expression delimiters
 * - `#` — literal/regex prefix (e.g., `#"..."`)
 * - `;` — comment delimiter
 * - `\n` / `\r` — could inject new SBPL lines or cause malformed profile parsing
 */
const SBPL_UNSAFE_PATTERN = /[()#;\n\r]/;

/**
 * Validate that a path does not contain SBPL metacharacters.
 * Paths with these characters cannot be safely embedded in sandbox profiles.
 * @throws {Error} if the path contains unsafe characters
 */
export function validateSandboxPath(input: string): void {
	if (SBPL_UNSAFE_PATTERN.test(input)) {
		throw new Error(
			`[sandbox] Path contains SBPL metacharacters and cannot be safely used in a sandbox profile: "${input}". ` +
				"Characters (, ), #, ;, and newline characters are not allowed in sandbox paths.",
		);
	}
}
