import {
  MESSAGE_GET_POPUP_STATE,
  MESSAGE_SET_PORT,
  MESSAGE_SET_TAB_CAPTURE,
  type PopupStateResponse,
  type ServerStatusResponse,
} from "./shared/protocol.ts";

const captureNote = requireElement<HTMLParagraphElement>("capture-note");
const captureToggle = requireElement<HTMLInputElement>("capture-toggle");
const deliveryStatus = requireElement<HTMLParagraphElement>("delivery-status");
const pageLabel = requireElement<HTMLParagraphElement>("page-label");
const portInput = requireElement<HTMLInputElement>("port-input");
const serverStatus = requireElement<HTMLParagraphElement>("server-status");

void bootstrap();

async function bootstrap(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    renderUnavailable();
    return;
  }

  pageLabel.textContent = tab.title || tab.url || "Current tab";

  const state = (await chrome.runtime.sendMessage({
    tabId: tab.id,
    type: MESSAGE_GET_POPUP_STATE,
  })) as PopupStateResponse;

  renderState(state);
  captureToggle.disabled = !state.capturable;
  captureNote.hidden = state.capturable;

  captureToggle.addEventListener("change", async () => {
    await chrome.runtime.sendMessage({
      enabled: captureToggle.checked,
      tabId: tab.id!,
      type: MESSAGE_SET_TAB_CAPTURE,
    });

    const nextState = (await chrome.runtime.sendMessage({
      tabId: tab.id,
      type: MESSAGE_GET_POPUP_STATE,
    })) as PopupStateResponse;
    renderState(nextState);
  });

  portInput.addEventListener("change", async () => {
    const status = (await chrome.runtime.sendMessage({
      port: portInput.value,
      type: MESSAGE_SET_PORT,
    })) as ServerStatusResponse;
    renderServerStatus(status);
  });
}

async function getActiveTab(): Promise<ChromeTab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function renderState(state: PopupStateResponse): void {
  captureToggle.checked = state.enabled;
  renderServerStatus(state);
}

function renderServerStatus(status: ServerStatusResponse): void {
  portInput.value = String(status.port);
  serverStatus.textContent = status.reachable
    ? `Server status: reachable on localhost:${status.port}`
    : `Server status: unreachable on localhost:${status.port}`;
  deliveryStatus.textContent = status.lastDeliveryError
    ? `Last delivery error: ${status.lastDeliveryError}`
    : "Last delivery error: none";
}

function renderUnavailable(): void {
  pageLabel.textContent = "This tab does not expose a page context.";
  captureToggle.checked = false;
  captureToggle.disabled = true;
  deliveryStatus.textContent = "Last delivery error: none";
  serverStatus.textContent = "Server status: unavailable";
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing popup element #${id}`);
  }

  return element as T;
}
