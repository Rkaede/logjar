import { serializeLogjarArg } from "../../cli/src/client/runtime.ts";
import {
  CONTROL_MESSAGE_SOURCE,
  CONTROL_MESSAGE_TYPE,
  PAGE_EVENT_NAME,
  type PageControlMessage,
  type PageLogDetail,
} from "./shared/protocol.ts";

declare global {
  interface Window {
    __LOGJAR_EXTENSION_BRIDGE__?: boolean;
  }
}

if (!window.__LOGJAR_EXTENSION_BRIDGE__) {
  window.__LOGJAR_EXTENSION_BRIDGE__ = true;

  let active = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    const payload = event.data as PageControlMessage | undefined;
    if (
      !payload ||
      payload.source !== CONTROL_MESSAGE_SOURCE ||
      payload.type !== CONTROL_MESSAGE_TYPE
    ) {
      return;
    }

    active = Boolean(payload.active);
  });

  patchConsole();
  patchWindowErrors();
  patchFetch();
  patchXhr();

  function emit(level: string, args: unknown[]): void {
    if (!active) return;

    const detail: PageLogDetail = {
      args: args.map(serializeLogjarArg),
      level,
      pageHost: window.location.host,
      pageTitle: document.title,
      pageUrl: window.location.href,
    };

    window.dispatchEvent(new CustomEvent(PAGE_EVENT_NAME, { detail }));
  }

  function patchConsole(): void {
    const methods = ["debug", "error", "info", "log", "warn"] as const;
    for (const method of methods) {
      const original = console[method];
      console[method] = function (...args: unknown[]) {
        emit(method, args);
        return original.apply(console, args);
      };
    }
  }

  function patchWindowErrors(): void {
    window.addEventListener("error", (event) => {
      emit("error", [
        `Uncaught ${event.error?.name || "Error"}: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
      ]);
    });

    window.addEventListener("unhandledrejection", (event) => {
      emit("error", [`Unhandled rejection: ${serializeLogjarArg(event.reason)}`]);
    });
  }

  function patchFetch(): void {
    const originalFetch = window.fetch;

    window.fetch = async function (...args: Parameters<typeof fetch>) {
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

  function patchXhr(): void {
    const openDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "open");
    const sendDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "send");
    if (
      typeof openDescriptor?.value !== "function" ||
      typeof sendDescriptor?.value !== "function"
    ) {
      return;
    }

    const originalOpen = openDescriptor.value;
    const originalSend = sendDescriptor.value;

    XMLHttpRequest.prototype.open = function (
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

      Reflect.apply(originalOpen, this, [
        method,
        url,
        async ?? true,
        username ?? null,
        password ?? null,
      ]);
    };

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
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

      Reflect.apply(originalSend, this, [body]);
    };
  }
}

declare global {
  interface XMLHttpRequest {
    __logjarRequest?: {
      method: string;
      url: string;
    };
  }
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
