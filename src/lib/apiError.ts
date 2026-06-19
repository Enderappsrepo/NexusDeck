export type ApiErrorContext =
  | "collections"
  | "collection-detail"
  | "dependencies"
  | "mod-detail"
  | "mods"
  | "generic";

export interface ParsedApiError {
  userMessage: string;
  title: string;
  retryable: boolean;
  raw: string;
}

const CONTEXT_MESSAGES: Record<ApiErrorContext, { title: string; message: string }> = {
  collections: {
    title: "Failed to load collections",
    message: "Check your API key in Settings or try again in a moment.",
  },
  "collection-detail": {
    title: "Failed to load collection",
    message: "This collection may be unavailable. Check your connection and try again.",
  },
  dependencies: {
    title: "Could not load dependencies",
    message: "Dependency info is temporarily unavailable. You can still browse and install files.",
  },
  "mod-detail": {
    title: "Failed to load mod",
    message: "Check your API key or try again.",
  },
  mods: {
    title: "Failed to load mods",
    message: "Check your API key or try again.",
  },
  generic: {
    title: "Something went wrong",
    message: "Check your API key or try again.",
  },
};

function extractMessage(raw: string): string {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ message?: string }>;
      if (parsed[0]?.message) return parsed[0].message;
    } catch {
      /* ignore */
    }
  }

  const nexusMatch = raw.match(/Nexus API error \(\d+\): (.+)/);
  if (nexusMatch) return nexusMatch[1];

  return raw;
}

export function parseNexusError(raw: unknown): ParsedApiError {
  const text = raw instanceof Error ? raw.message : String(raw);
  const detail = extractMessage(text);
  const lower = text.toLowerCase();

  let userMessage = detail;
  let retryable = true;

  if (lower.includes("invalid api key") || lower.includes("unauthorized") || lower.includes("401")) {
    userMessage = "Your Nexus API key is invalid or expired. Update it in Settings.";
    retryable = false;
  } else if (lower.includes("premium")) {
    userMessage = "This action requires a Nexus Premium subscription.";
    retryable = false;
  } else if (lower.includes("rate limit")) {
    userMessage = "Nexus API rate limit reached. Wait a moment and try again.";
  } else if (detail.length > 180 || detail.startsWith("[{")) {
    userMessage = "Request failed. Check your API key or try again.";
  }

  return {
    userMessage,
    title: CONTEXT_MESSAGES.generic.title,
    retryable,
    raw: text,
  };
}

export function getUserMessage(context: ApiErrorContext, raw: unknown): ParsedApiError {
  const parsed = parseNexusError(raw);
  const ctx = CONTEXT_MESSAGES[context];
  return {
    ...parsed,
    title: ctx.title,
    userMessage: parsed.userMessage === parseNexusError(raw).userMessage ? ctx.message : parsed.userMessage,
  };
}

export function logApiError(context: string, raw: unknown): void {
  console.error(`[NexusDeck:${context}]`, raw);
}

export const REPORT_ISSUE_URL =
  "https://github.com/nexusdeck/nexusdeck/issues/new?labels=bug&title=API%20Error";
