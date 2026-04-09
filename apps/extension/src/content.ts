import { createLogBatcher } from "../../cli/src/client/runtime.ts";
import {
  CONTROL_MESSAGE_SOURCE,
  CONTROL_MESSAGE_TYPE,
  MESSAGE_DELIVER_BATCH,
  MESSAGE_GET_CONTENT_STATE,
  MESSAGE_SET_TAB_CAPTURE,
  PAGE_EVENT_NAME,
  type ContentStateResponse,
  type ContentToggleMessage,
  type DeliverBatchMessage,
  type PageControlMessage,
  type PageLogDetail,
} from "./shared/protocol.ts";

let captureEnabled = false;
let bridgeInjected = false;

const batcher = createLogBatcher({
  sourceKind: "extension",
  transport(batch) {
    if (!captureEnabled || batch.length === 0) return;
    return (
      chrome.runtime.sendMessage({
        batch,
        type: MESSAGE_DELIVER_BATCH,
      } satisfies DeliverBatchMessage) as Promise<unknown>
    ).then(() => undefined);
  },
});

window.addEventListener(PAGE_EVENT_NAME, (event) => {
  if (!captureEnabled) return;

  const detail = (event as CustomEvent<PageLogDetail>).detail;
  if (!detail) return;

  batcher.enqueue(detail.level, detail.args, {
    pageHost: detail.pageHost || window.location.host,
    pageTitle: detail.pageTitle || document.title,
    pageUrl: detail.pageUrl || window.location.href,
  });
});

chrome.runtime.onMessage.addListener((message) => {
  const payload = message as ContentToggleMessage | undefined;
  if (!payload || payload.type !== MESSAGE_SET_TAB_CAPTURE) {
    return;
  }

  applyCaptureState(Boolean(payload.enabled));
});

void bootstrap();

async function bootstrap(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: MESSAGE_GET_CONTENT_STATE,
  })) as ContentStateResponse;

  applyCaptureState(Boolean(response?.enabled));
}

function applyCaptureState(enabled: boolean): void {
  captureEnabled = enabled;

  if (enabled) {
    ensurePageBridge();
    postControl(true);
    return;
  }

  batcher.flush();
  if (bridgeInjected) {
    postControl(false);
  }
}

function ensurePageBridge(): void {
  if (bridgeInjected) {
    return;
  }

  const script = document.createElement("script");
  script.async = false;
  script.src = chrome.runtime.getURL("page-bridge.iife.js");
  (document.head || document.documentElement).appendChild(script);
  script.remove();
  bridgeInjected = true;
}

function postControl(active: boolean): void {
  window.postMessage(
    {
      active,
      source: CONTROL_MESSAGE_SOURCE,
      type: CONTROL_MESSAGE_TYPE,
    } satisfies PageControlMessage,
    "*",
  );
}
