import type { LogjarFrontendEntry } from "../../../cli/src/shared/constants.ts";

export const PAGE_EVENT_NAME = "__logjar_extension_log__";
export const CONTROL_MESSAGE_SOURCE = "__logjar_extension_control__";
export const CONTROL_MESSAGE_TYPE = "logjar:set-active";

export const MESSAGE_GET_CONTENT_STATE = "logjar:get-content-state";
export const MESSAGE_GET_POPUP_STATE = "logjar:get-popup-state";
export const MESSAGE_SET_PORT = "logjar:set-port";
export const MESSAGE_SET_TAB_CAPTURE = "logjar:set-tab-capture";
export const MESSAGE_DELIVER_BATCH = "logjar:deliver-batch";

export interface PageLogDetail {
  args: unknown[];
  level: string;
  pageHost?: string;
  pageTitle?: string;
  pageUrl?: string;
}

export interface PageControlMessage {
  active: boolean;
  source: typeof CONTROL_MESSAGE_SOURCE;
  type: typeof CONTROL_MESSAGE_TYPE;
}

export interface ContentStateResponse {
  enabled: boolean;
  port: number;
}

export interface PopupStateResponse extends ContentStateResponse {
  lastDeliveryError: string | null;
  reachable: boolean;
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

export interface ContentToggleMessage {
  enabled: boolean;
  type: typeof MESSAGE_SET_TAB_CAPTURE;
}
