import {
  DEFAULT_PORT,
  LOG_ENDPOINT,
  type LogjarFrontendEntry,
} from "../../cli/src/shared/constants.ts";
import {
  MESSAGE_DELIVER_BATCH,
  MESSAGE_GET_CONTENT_STATE,
  MESSAGE_GET_POPUP_STATE,
  MESSAGE_SET_PORT,
  MESSAGE_SET_TAB_CAPTURE,
  type ContentStateResponse,
  type DeliverBatchMessage,
  type GetPopupStateMessage,
  type PopupStateResponse,
  type SetPortMessage,
  type SetTabCaptureMessage,
} from "./shared/protocol.ts";
import {
  STORAGE_KEYS,
  isTabEnabled,
  normalizePort,
  sanitizeEnabledTabs,
  setTabEnabled,
  type ExtensionState,
} from "./shared/state.ts";

let lastDeliveryError: string | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      sendResponse({ error: reason, ok: false });
    });

  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void pruneTabState(tabId);
});

// Earlier versions kept the enabled tabs in local storage, where they
// outlived the browser session.
chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.remove(STORAGE_KEYS.enabledTabs);
});

async function handleMessage(
  message: unknown,
  sender: ChromeRuntimeMessageSender,
): Promise<unknown> {
  if (!message || typeof message !== "object") {
    return { ok: false };
  }

  const type = (message as { type?: string }).type;

  switch (type) {
    case MESSAGE_GET_CONTENT_STATE:
      return getContentState(sender.tab?.id);
    case MESSAGE_GET_POPUP_STATE:
      return getPopupState((message as GetPopupStateMessage).tabId);
    case MESSAGE_SET_PORT:
      return setPort((message as SetPortMessage).port);
    case MESSAGE_SET_TAB_CAPTURE: {
      const payload = message as SetTabCaptureMessage;
      return setCapture(payload.tabId, payload.enabled);
    }
    case MESSAGE_DELIVER_BATCH:
      return deliverBatch((message as DeliverBatchMessage).batch);
    default:
      return { ok: false };
  }
}

async function getContentState(tabId?: number): Promise<ContentStateResponse> {
  const state = await readState();
  return {
    enabled: isTabEnabled(state.enabledTabs, tabId),
    port: state.port,
  };
}

async function getPopupState(tabId?: number): Promise<PopupStateResponse> {
  const state = await readState();
  return {
    enabled: isTabEnabled(state.enabledTabs, tabId),
    lastDeliveryError,
    port: state.port,
    reachable: await probeServer(state.port),
  };
}

async function setPort(port: number | string): Promise<PopupStateResponse> {
  const state = await readState();
  const nextPort = normalizePort(port, state.port);
  await chrome.storage.local.set({ [STORAGE_KEYS.port]: nextPort });
  return {
    enabled: false,
    lastDeliveryError,
    port: nextPort,
    reachable: await probeServer(nextPort),
  };
}

async function setCapture(
  tabId: number,
  enabled: boolean,
): Promise<{ enabled: boolean; ok: true }> {
  const state = await readState();
  await writeEnabledTabs(setTabEnabled(state.enabledTabs, tabId, enabled));
  await notifyTab(tabId, enabled);
  return { enabled, ok: true };
}

async function deliverBatch(batch: LogjarFrontendEntry[]): Promise<{ ok: boolean }> {
  if (!Array.isArray(batch) || batch.length === 0) {
    return { ok: true };
  }

  const state = await readState();
  try {
    await postBatch(state.port, batch);
    lastDeliveryError = null;
    return { ok: true };
  } catch (error) {
    lastDeliveryError = error instanceof Error ? error.message : String(error);
    return { ok: false };
  }
}

// Tab IDs are only meaningful for the current browser session, so the enabled
// tabs live in session storage. The port is kept across restarts.
async function readState(): Promise<ExtensionState> {
  const [session, local] = await Promise.all([
    chrome.storage.session.get(STORAGE_KEYS.enabledTabs),
    chrome.storage.local.get(STORAGE_KEYS.port),
  ]);
  return {
    enabledTabs: sanitizeEnabledTabs(session[STORAGE_KEYS.enabledTabs]),
    port: normalizePort(local[STORAGE_KEYS.port], DEFAULT_PORT),
  };
}

async function writeEnabledTabs(enabledTabs: Record<string, true>): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEYS.enabledTabs]: enabledTabs });
}

async function pruneTabState(tabId: number): Promise<void> {
  const state = await readState();
  await writeEnabledTabs(setTabEnabled(state.enabledTabs, tabId, false));
}

async function notifyTab(tabId: number, enabled: boolean): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      enabled,
      type: MESSAGE_SET_TAB_CAPTURE,
    });
  } catch {
    // Ignore unsupported or unloaded tabs.
  }
}

async function probeServer(port: number): Promise<boolean> {
  try {
    const response = await fetch(buildEndpoint(port), {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function postBatch(port: number, batch: LogjarFrontendEntry[]): Promise<void> {
  const response = await fetch(buildEndpoint(port), {
    body: JSON.stringify(batch),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Logjar server responded with ${response.status}`);
  }
}

function buildEndpoint(port: number): string {
  return `http://localhost:${port}${LOG_ENDPOINT}`;
}
