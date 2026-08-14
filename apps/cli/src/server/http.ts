import http from "node:http";
import { formatEntry, LOG_ENDPOINT, type LogjarFrontendEntry } from "../shared/constants.ts";

interface StartServerOptions {
  port: number;
  onEntry: (line: string) => void;
}

const LOOPBACK_HOST = "localhost";
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB

/**
 * Starts a tiny HTTP server that:
 *  - POST /__logjar  → accepts JSON log entries from the browser client
 *  - GET  /__logjar  → health-check / info
 *
 * Calls `onEntry(formattedLine)` for every received log line.
 */
export async function startServer({ port, onEntry }: StartServerOptions): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (!isTrustedOriginHeader(req.headers.origin)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end('{"ok":false,"error":"origin not allowed"}');
      return;
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders(req));
      return res.end();
    }

    if (req.url === LOG_ENDPOINT && req.method === "POST") {
      const chunks: Buffer[] = [];
      let received = 0;
      let aborted = false;
      req.on("data", (chunk: Buffer) => {
        if (aborted) return;
        received += chunk.length;
        if (received > MAX_BODY_BYTES) {
          aborted = true;
          res.writeHead(413, corsHeaders(req, { "Content-Type": "application/json" }));
          res.end('{"ok":false,"error":"payload too large"}');
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (aborted) return;
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          const payload = JSON.parse(body);
          for (const line of formatFrontendEntries(payload)) {
            onEntry(line);
          }
          res.writeHead(200, corsHeaders(req, { "Content-Type": "application/json" }));
          res.end('{"ok":true}');
        } catch {
          res.writeHead(400, corsHeaders(req, { "Content-Type": "application/json" }));
          res.end('{"ok":false,"error":"invalid json"}');
        }
      });
      return;
    }

    if (req.url === LOG_ENDPOINT && req.method === "GET") {
      res.writeHead(200, corsHeaders(req, { "Content-Type": "application/json" }));
      res.end(JSON.stringify({ status: "logjar running", port: getListeningPort(server) }));
      return;
    }

    // Everything else → 404
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error): void => {
      reject(error);
    };

    server.once("error", handleError);
    server.listen(port, LOOPBACK_HOST, () => {
      server.off("error", handleError);
      resolve();
    });
  });

  return server;
}

export function getListeningPort(server: http.Server): number {
  const address = server.address();
  if (address == null || typeof address === "string") {
    throw new Error("[logjar] HTTP server is not listening on a TCP port");
  }

  return address.port;
}

export function formatFrontendEntries(payload: unknown): string[] {
  const entries: LogjarFrontendEntry[] = Array.isArray(payload)
    ? payload
    : [payload as LogjarFrontendEntry];

  return entries.map((entry) => {
    const { level = "log", args = [], app, ...metadata } = entry;
    return formatEntry("fe", level, args, app, metadata);
  });
}

function corsHeaders(
  req: http.IncomingMessage,
  extra: Record<string, string> = {},
): Record<string, string> {
  const origin = req.headers.origin;
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra,
  };
  // Wildcard origin is invalid when the browser sends credentialed requests
  // (fetch with credentials: 'include'). Echo Origin + Allow-Credentials instead.
  if (origin) {
    base["Access-Control-Allow-Origin"] = origin;
    base["Access-Control-Allow-Credentials"] = "true";
  } else {
    base["Access-Control-Allow-Origin"] = "*";
  }
  return base;
}

export function isTrustedOriginHeader(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  try {
    const url = new URL(origin);
    if (url.protocol === "chrome-extension:") {
      return true;
    }

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (LOOPBACK_HOSTNAMES.has(url.hostname) || url.hostname.endsWith(".localhost"))
    );
  } catch {
    return false;
  }
}
