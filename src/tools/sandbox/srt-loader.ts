let cached: typeof import("@anthropic-ai/sandbox-runtime") | null | undefined;

export async function loadSrt(): Promise<
	typeof import("@anthropic-ai/sandbox-runtime") | null
> {
	if (cached !== undefined) return cached;
	try {
		cached = await import("@anthropic-ai/sandbox-runtime");
		return cached;
	} catch {
		cached = null;
		return null;
	}
}
