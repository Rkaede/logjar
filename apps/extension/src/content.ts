import { createLogBatcher } from "../../cli/src/client/runtime.ts";
import {
  BRIDGE_READY_EVENT,
  CAPTURE_OFF_EVENT,
  CAPTURE_ON_EVENT,
  MESSAGE_DELIVER_BATCH,
  MESSAGE_GET_CONTENT_STATE,
  MESSAGE_PING,
  MESSAGE_SET_TAB_CAPTURE,
  PAGE_EVENT_NAME,
  type ContentStateResponse,
  type ContentToggleMessage,
  type DeliverBatchMessage,
  type PageLogDetail,
  type PingMessage,
} from "./shared/protocol.ts";

// Undefined until the background answers.
let captureEnabled: boolean | undefined;

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

// The page bridge may load after the state was first sent.
window.addEventListener(BRIDGE_READY_EVENT, () => {
  if (captureEnabled !== undefined) notifyBridge(captureEnabled);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const payload = message as ContentToggleMessage | PingMessage | undefined;
  if (payload?.type === MESSAGE_PING) {
    sendResponse({ ok: true });
  } else if (payload?.type === MESSAGE_SET_TAB_CAPTURE) {
    applyCaptureState(Boolean(payload.enabled));
  }
});

void bootstrap();

async function bootstrap(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: MESSAGE_GET_CONTENT_STATE,
  })) as ContentStateResponse;

  applyCaptureState(Boolean(response?.enabled));
}

function applyCaptureState(enabled: boolean): void {
  if (!enabled) {
    // Deliver what was captured while enabled. The transport drops batches
    // once capture is off, so the flag changes only after the flush.
    batcher.flush();
  }
  captureEnabled = enabled;
  notifyBridge(enabled);
}

function notifyBridge(enabled: boolean): void {
  window.dispatchEvent(new CustomEvent(enabled ? CAPTURE_ON_EVENT : CAPTURE_OFF_EVENT));
}
