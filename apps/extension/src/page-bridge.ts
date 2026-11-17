import { formatUncaughtError, serializeLogjarArg } from "../../cli/src/client/runtime.ts";
import { patchMethod } from "./shared/patch.ts";
import {
  BRIDGE_READY_EVENT,
  CAPTURE_OFF_EVENT,
  CAPTURE_ON_EVENT,
  PAGE_EVENT_NAME,
  type PageLogDetail,
} from "./shared/protocol.ts";

// The manifest runs this in the page's own world at document_start on every
// page, before the content script knows whether capture is on for the tab.
// Entries are held until it says, then delivered, or dropped and the page
// restored.

const MAX_PENDING_ENTRIES = 200;
// Restores the page if the content script never sends the state.
const STATE_TIMEOUT_MS = 10_000;

declare global {
  interface XMLHttpRequest {
    __logjarRequest?: {
      method: string;
      url: string;
    };
  }
}

let state: "pending" | "active" | "inactive" = "pending";
let pending: PageLogDetail[] = [];

const patches = [
  ...(["debug", "error", "info", "log", "warn"] as const).map((method) =>
    patchMethod(
      console,
      method,
      (original) =>
        function (...args: unknown[]) {
          emit(method, args);
          return original.apply(console, args);
        },
    ),
  ),
  patchMethod(window, "fetch", wrapFetch),
  patchMethod(XMLHttpRequest.prototype, "open", wrapXhrOpen),
  patchMethod(XMLHttpRequest.prototype, "send", wrapXhrSend),
];
for (const patch of patches) patch.install();

window.addEventListener("error", (event) => {
  emit("error", [formatUncaughtError(event)]);
});

window.addEventListener("unhandledrejection", (event) => {
  emit("error", [`Unhandled rejection: ${serializeLogjarArg(event.reason)}`]);
});

const stateTimeout = setTimeout(() => setActive(false), STATE_TIMEOUT_MS);
window.addEventListener(CAPTURE_ON_EVENT, () => setActive(true));
window.addEventListener(CAPTURE_OFF_EVENT, () => setActive(false));
window.dispatchEvent(new CustomEvent(BRIDGE_READY_EVENT));

function setActive(active: boolean): void {
  clearTimeout(stateTimeout);
  state = active ? "active" : "inactive";
  for (const patch of patches) {
    if (active) {
      patch.install();
    } else {
      patch.uninstall();
    }
  }
  if (active) pending.forEach(dispatch);
  pending = [];
}

function emit(level: string, args: unknown[]): void {
  if (state === "inactive") return;

  const detail: PageLogDetail = {
    args: args.map(serializeLogjarArg),
    level,
    pageHost: window.location.host,
    pageTitle: document.title,
    pageUrl: window.location.href,
  };

  if (state === "active") {
    dispatch(detail);
  } else if (pending.length < MAX_PENDING_ENTRIES) {
    pending.push(detail);
  }
}

function dispatch(detail: PageLogDetail): void {
  window.dispatchEvent(new CustomEvent(PAGE_EVENT_NAME, { detail }));
}

function wrapFetch(originalFetch: typeof fetch): typeof fetch {
  return async function (...args: Parameters<typeof fetch>) {
    const request = describeFetchRequest(args[0], args[1]);
    try {
      const response = await originalFetch.apply(window, args);
      if (!response.ok) {
        emit("warn", [
          `Fetch ${request.method} ${request.url} -> ${response.status} ${response.statusText}`,
        ]);
      }
      return response;
    } catch (error) {
      emit("error", [
        `Fetch ${request.method} ${request.url} failed: ${serializeLogjarArg(error)}`,
      ]);
      throw error;
    }
  };
}

function wrapXhrOpen(originalOpen: XMLHttpRequest["open"]): XMLHttpRequest["open"] {
  return function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    this.__logjarRequest = {
      method: method.toUpperCase(),
      url: normalizeUrl(url),
    };

    originalOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
  };
}

function wrapXhrSend(originalSend: XMLHttpRequest["send"]): XMLHttpRequest["send"] {
  return function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const request = this.__logjarRequest || { method: "GET", url: window.location.href };

    this.addEventListener(
      "error",
      () => {
        emit("error", [`XHR ${request.method} ${request.url} failed`]);
      },
      { once: true },
    );

    this.addEventListener(
      "timeout",
      () => {
        emit("warn", [`XHR ${request.method} ${request.url} timed out`]);
      },
      { once: true },
    );

    this.addEventListener(
      "abort",
      () => {
        emit("warn", [`XHR ${request.method} ${request.url} aborted`]);
      },
      { once: true },
    );

    this.addEventListener(
      "loadend",
      () => {
        if (this.status >= 400) {
          emit("warn", [
            `XHR ${request.method} ${request.url} -> ${this.status} ${this.statusText}`,
          ]);
        }
      },
      { once: true },
    );

    originalSend.call(this, body);
  };
}

function describeFetchRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): {
  method: string;
  url: string;
} {
  const method =
    init?.method ||
    (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");

  if (typeof input === "string") {
    return { method: method.toUpperCase(), url: normalizeUrl(input) };
  }

  if (input instanceof URL) {
    return { method: method.toUpperCase(), url: input.href };
  }

  return { method: method.toUpperCase(), url: normalizeUrl(input.url) };
}

function normalizeUrl(value: string | URL): string {
  const raw = String(value);
  try {
    return new URL(raw, window.location.href).href;
  } catch {
    return raw;
  }
}
