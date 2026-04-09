import { DEFAULT_PORT } from "../../../cli/src/shared/constants.ts";

export const STORAGE_KEYS = {
  enabledTabs: "logjarExtensionEnabledTabs",
  port: "logjarExtensionPort",
} as const;

export interface ExtensionState {
  enabledTabs: Record<string, true>;
  port: number;
}

export function normalizePort(value: unknown, fallback = DEFAULT_PORT): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function sanitizeEnabledTabs(value: unknown): Record<string, true> {
  if (!value || typeof value !== "object") return {};

  const next: Record<string, true> = {};
  for (const [tabId, enabled] of Object.entries(value)) {
    if (/^\d+$/.test(tabId) && enabled === true) {
      next[tabId] = true;
    }
  }

  return next;
}

export function isTabEnabled(enabledTabs: Record<string, true>, tabId?: number): boolean {
  if (typeof tabId !== "number") return false;
  return enabledTabs[String(tabId)] === true;
}

export function setTabEnabled(
  enabledTabs: Record<string, true>,
  tabId: number,
  enabled: boolean,
): Record<string, true> {
  const next = { ...enabledTabs };
  if (enabled) {
    next[String(tabId)] = true;
  } else {
    delete next[String(tabId)];
  }
  return next;
}
