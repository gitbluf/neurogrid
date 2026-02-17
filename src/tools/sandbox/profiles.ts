import * as path from "node:path";
import { existsSync, readdirSync } from "node:fs";

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

type ProfilePaths = {
	projectDir: string;
	homeDir: string;
};

const ENV_DENY_PATTERNS = [".env", ".env.*", ".env.local", ".env.*.local"];

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

export function buildSandboxExecProfile(
	profile: SecurityProfile,
	paths: ProfilePaths,
): string {
	const projectDir = escapeSchemePath(paths.projectDir);
	const homeDir = escapeSchemePath(paths.homeDir);

	const lines: string[] = [];
	lines.push("(version 1)");
	lines.push("(allow default)");

	if (profile !== "network-allow") {
		lines.push("(deny network*)");
	}

	const denyProjectEnvReads = buildSandboxExecEnvDenyRules(
		projectDir,
		"file-read-data",
	);
	const denyProjectEnvWrites = buildSandboxExecEnvDenyRules(
		projectDir,
		"file-write*",
	);
	const denyGitConfigWrite = buildSandboxExecGitConfigDeny(projectDir);

	if (profile === "readonly") {
		lines.push("(deny file-write*)");
		lines.push(...denyProjectEnvReads);
	} else {
		lines.push(`(deny file-write* (subpath "${homeDir}"))`);
		lines.push(`(allow file-write* (subpath "${projectDir}"))`);
		lines.push(...denyProjectEnvWrites);
		lines.push(...denyGitConfigWrite);
		lines.push(...denyProjectEnvReads);
		lines.push('(allow file-write* (subpath "/tmp"))');
		lines.push('(allow file-write* (subpath "/private/tmp"))');
	}

	lines.push(...buildSandboxExecSensitiveReadDenies(homeDir));
	lines.push('(deny process-exec (literal "/usr/bin/sudo"))');
	lines.push('(deny process-exec (literal "/usr/bin/su"))');
	lines.push('(deny process-exec (literal "/usr/bin/doas"))');

	return lines.join("\n");
}

function buildSandboxExecGitConfigDeny(projectDir: string): string[] {
	const gitConfigPath = path.join(projectDir, ".git", "config");
	return [
		"(deny file-write*",
		`  (literal "${escapeSchemePath(gitConfigPath)}")`,
		")",
	];
}

export function buildBwrapArgs(
	profile: SecurityProfile,
	opts: {
		projectDir: string;
		cwd: string;
		env: Record<string, string>;
	},
): string[] {
	const args: string[] = [];

	args.push("--clearenv");
	args.push("--ro-bind", "/usr", "/usr");
	args.push("--ro-bind", "/bin", "/bin");
	args.push("--ro-bind", "/lib", "/lib");
	if (pathExists("/lib64")) {
		args.push("--ro-bind", "/lib64", "/lib64");
	}
	args.push("--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf");
	args.push("--ro-bind", "/etc/ssl", "/etc/ssl");
	args.push("--ro-bind", "/etc/ca-certificates", "/etc/ca-certificates");
	if (profile === "readonly") {
		args.push("--ro-bind", opts.projectDir, opts.projectDir);
	} else {
		args.push("--bind", opts.projectDir, opts.projectDir);
	}
	const gitConfigPath = path.join(opts.projectDir, ".git", "config");
	if (existsSync(gitConfigPath)) {
		args.push("--ro-bind", gitConfigPath, gitConfigPath);
	}
	args.push("--tmpfs", "/tmp");
	args.push("--proc", "/proc");
	args.push("--dev", "/dev");
	args.push("--unshare-pid");
	args.push("--unshare-ipc");
	args.push("--die-with-parent");
	args.push("--new-session");

	if (profile !== "network-allow") {
		args.push("--unshare-net");
	}

	args.push("--chdir", opts.cwd);

	const envDenyTargets = findEnvFilesForBwrap(opts.projectDir);
	for (const target of envDenyTargets) {
		args.push("--ro-bind", "/dev/null", target);
	}

	for (const key of ALLOWED_BASE_ENV_VARS) {
		const value = process.env[key];
		if (value !== undefined) {
			args.push("--setenv", key, value);
		}
	}

	const sanitizedEnv = sanitizeEnv(opts.env);
	for (const [key, value] of Object.entries(sanitizedEnv)) {
		args.push("--setenv", key, value);
	}

	return args;
}

export function filterProjectEnvDenies(projectDir: string): {
	literal: string[];
	regex: string[];
} {
	const literals = ENV_DENY_PATTERNS.filter(
		(pattern) => !pattern.includes("*"),
	).map((pattern) => path.join(projectDir, pattern));
	const regex = ENV_DENY_PATTERNS.filter((pattern) =>
		pattern.includes("*"),
	).map((pattern) => {
		const escaped = escapeRegex(path.join(projectDir, pattern));
		return escaped.replace(/\\\*/g, ".*");
	});

	return { literal: literals, regex };
}

function buildSandboxExecEnvDenyRules(
	projectDir: string,
	operation: "file-read-data" | "file-write*",
): string[] {
	const { literal, regex } = filterProjectEnvDenies(projectDir);
	const lines: string[] = [];

	if (literal.length === 0 && regex.length === 0) {
		return lines;
	}

	const ruleLines = [
		...literal.map((item) => `(literal "${escapeSchemePath(item)}")`),
	];
	const regexLines = regex.map(
		(pattern) => `(regex #"${escapeSchemePath(pattern)}")`,
	);

	lines.push(`(deny ${operation}`);
	for (const entry of [...ruleLines, ...regexLines]) {
		lines.push(`  ${entry}`);
	}
	lines.push(")");

	return lines;
}

function buildSandboxExecSensitiveReadDenies(homeDir: string): string[] {
	const denyPaths = [
		".ssh",
		".gnupg",
		".aws",
		".config/gcloud",
		".azure",
		".kube",
		".docker",
		".netrc",
		".npmrc",
		".pypirc",
	];

	const lines: string[] = [];
	lines.push("(deny file-read-data");
	for (const denyPath of denyPaths) {
		const fullPath = path.join(homeDir, denyPath);
		lines.push(`  (subpath "${escapeSchemePath(fullPath)}")`);
	}
	lines.push(")");
	return lines;
}

function escapeSchemePath(input: string): string {
	return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeRegex(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeEnv(env: Record<string, string>): Record<string, string> {
	const sanitized: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
			continue;
		}
		sanitized[key] = value;
	}
	return sanitized;
}

function pathExists(checkPath: string): boolean {
	return existsSync(checkPath);
}

function findEnvFilesForBwrap(projectDir: string): string[] {
	const envFiles: string[] = [];
	try {
		const entries = readdirSync(projectDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			if (!entry.name.startsWith(".env")) continue;
			if (/^\.env(\..*)?$/.test(entry.name)) {
				envFiles.push(path.join(projectDir, entry.name));
			}
		}
	} catch {
		return [];
	}

	return envFiles;
}
