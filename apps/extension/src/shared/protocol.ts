import type { LogjarFrontendEntry } from "../../../cli/src/shared/constants.ts";

// DOM events between the page bridge and the content script. Unlike
// postMessage, they reach only listeners for these exact names, so the page's
// own message handlers never see them.
export const PAGE_EVENT_NAME = "__logjar_extension_log__";
export const BRIDGE_READY_EVENT = "__logjar_extension_bridge_ready__";
export const CAPTURE_ON_EVENT = "__logjar_extension_capture_on__";
export const CAPTURE_OFF_EVENT = "__logjar_extension_capture_off__";

export const MESSAGE_GET_CONTENT_STATE = "logjar:get-content-state";
export const MESSAGE_GET_POPUP_STATE = "logjar:get-popup-state";
export const MESSAGE_SET_PORT = "logjar:set-port";
export const MESSAGE_SET_TAB_CAPTURE = "logjar:set-tab-capture";
export const MESSAGE_DELIVER_BATCH = "logjar:deliver-batch";
export const MESSAGE_PING = "logjar:ping";

export interface PageLogDetail {
  args: unknown[];
  level: string;
  pageHost?: string;
  pageTitle?: string;
  pageUrl?: string;
}

export interface ContentStateResponse {
  enabled: boolean;
  port: number;
}

export interface ServerStatusResponse {
  lastDeliveryError: string | null;
  port: number;
  reachable: boolean;
}

export interface PopupStateResponse extends ServerStatusResponse {
  /** False when the tab's content script does not answer. */
  capturable: boolean;
  enabled: boolean;
}

export interface DeliverBatchMessage {
  batch: LogjarFrontendEntry[];
  type: typeof MESSAGE_DELIVER_BATCH;
}

export interface GetPopupStateMessage {
  tabId?: number;
  type: typeof MESSAGE_GET_POPUP_STATE;
}

export interface SetPortMessage {
  port: number | string;
  type: typeof MESSAGE_SET_PORT;
}

export interface SetTabCaptureMessage {
  enabled: boolean;
  tabId: number;
  type: typeof MESSAGE_SET_TAB_CAPTURE;
}

export interface PingMessage {
  type: typeof MESSAGE_PING;
}

export interface ContentToggleMessage {
  enabled: boolean;
  type: typeof MESSAGE_SET_TAB_CAPTURE;
}
