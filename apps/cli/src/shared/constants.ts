// Defaults
export const DEFAULT_PORT = 8797;
export const DEFAULT_LOG_FILE = ".logjar/logs.txt";
export const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
export const DEFAULT_MAX_SIZE_BYTES = 200 * 1024; // 200 KB
export const LOG_ENDPOINT = "/__logjar";
export const DEFAULT_BATCH_INTERVAL_MS = 500;
export const LOG_LEVELS = ["log", "info", "warn", "error", "debug"] as const;
export const DEFAULT_FRONTEND_LOG_LEVELS = ["log", "info", "warn", "error"] as const;

export type LogjarLogLevel = (typeof LOG_LEVELS)[number];
export type FrontendSourceKind = "embedded" | "extension";

export interface FrontendLogMetadata {
  sourceKind?: FrontendSourceKind;
  pageUrl?: string;
  pageTitle?: string;
  pageHost?: string;
}

export interface LogjarFrontendEntry extends FrontendLogMetadata {
  level?: string;
  args?: unknown[];
  app?: string;
}

const LOG_LEVEL_SET = new Set<LogjarLogLevel>(LOG_LEVELS);

function isLogjarLogLevel(level: string): level is LogjarLogLevel {
  return LOG_LEVEL_SET.has(level as LogjarLogLevel);
}

export function parseLogLevels(value?: string | readonly string[] | null): LogjarLogLevel[] {
  if (value == null) return [...DEFAULT_FRONTEND_LOG_LEVELS];

  let requestedLevels: string[];
  if (typeof value === "string") {
    requestedLevels = value
      .split(",")
      .map((part: string) => part.trim())
      .filter(Boolean);
  } else {
    requestedLevels = [...value];
  }
  const requestedSet = new Set<LogjarLogLevel>(
    requestedLevels
      .map((level: string) => level.toLowerCase())
      .filter((level: string): level is LogjarLogLevel => isLogjarLogLevel(level)),
  );

  return LOG_LEVELS.filter((level) => requestedSet.has(level));
}

export function shouldCaptureLevel(
  level: string,
  enabledLevels: readonly LogjarLogLevel[],
): level is LogjarLogLevel {
  return enabledLevels.includes(level as LogjarLogLevel);
}

// Format a log entry as a single line
export function formatEntry(
  source: "fe" | "be",
  level: string,
  args: unknown[],
  app?: string,
  metadata: FrontendLogMetadata = {},
): string {
  const ts = new Date().toISOString();
  const labelParts = [source === "fe" ? "FE" : "BE"];
  if (source === "fe" && metadata.sourceKind === "extension") {
    labelParts.push("ext");
  }
  if (app) {
    labelParts.push(app);
  }
  const label = labelParts.join(":");
  const message = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  const context = formatContextSuffix(metadata);

  if (message) {
    return `[${ts}] [${label}] [${level.toUpperCase()}] ${message}${context}`;
  }

  return `[${ts}] [${label}] [${level.toUpperCase()}]${context}`;
}

function formatContextSuffix(metadata: FrontendLogMetadata): string {
  const context: string[] = [];

  if (metadata.pageTitle) {
    context.push(`title="${metadata.pageTitle.replaceAll('"', '\\"')}"`);
  }

  if (metadata.pageUrl) {
    context.push(`url=${metadata.pageUrl}`);
  } else if (metadata.pageHost) {
    context.push(`host=${metadata.pageHost}`);
  }

  return context.length > 0 ? ` (${context.join(", ")})` : "";
}
