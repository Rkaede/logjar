/**
 * logjar <script> snippet
 *
 * For apps where you can't use `import`, drop this into your HTML:
 *
 *   <script src="./node_modules/logjar/src/client/snippet.js"></script>
 *
 * Or copy-paste the minified version from the README.
 * Same behavior as the ES module client.
 */

// This file is identical to index.js — it's an IIFE so it works as a plain <script>.
// The contents are inlined here so there are no import dependencies.
(function () {
  if (typeof window === "undefined") return;

  var port =
    window.__LOGJAR_PORT ||
    (document.querySelector('meta[name="logjar-port"]') || {}).content ||
    8797;
  var app =
    window.__LOGJAR_APP ||
    (document.querySelector('meta[name="logjar-app"]') || {}).content ||
    undefined;
  var rawLevels =
    window.__LOGJAR_LEVELS ?? (document.querySelector('meta[name="logjar-levels"]') || {}).content;
  var orderedLevels = ["log", "info", "warn", "error", "debug"];
  var enabledLevelSet = (function parseLogLevels(value) {
    if (value == null) return new Set(["log", "info", "warn", "error"]);
    var requestedLevels = Array.isArray(value)
      ? value
      : String(value)
          .split(",")
          .map(function (part) {
            return part.trim();
          })
          .filter(Boolean);
    var requestedSet = new Set();
    for (var i = 0; i < requestedLevels.length; i++) {
      var level = String(requestedLevels[i]).toLowerCase();
      if (orderedLevels.indexOf(level) !== -1) requestedSet.add(level);
    }
    return requestedSet;
  })(rawLevels);

  var endpoint = "http://localhost:" + port + "/__logjar";
  var BATCH_INTERVAL = 500;
  var queue = [];
  var timer = null;

  function serializeArg(arg) {
    if (arg instanceof Error) return arg.name + ": " + arg.message;
    if (typeof arg === "string") return arg;
    if (typeof arg === "number" || typeof arg === "boolean" || typeof arg === "bigint") {
      return "" + arg;
    }
    if (typeof arg === "undefined") return "undefined";
    if (typeof arg === "symbol") return arg.toString();
    if (typeof arg === "function") return "[Function " + (arg.name || "anonymous") + "]";
    if (arg === null) return "null";
    try {
      return JSON.stringify(arg) ?? "undefined";
    } catch {
      return Object.prototype.toString.call(arg);
    }
  }

  function flush() {
    if (queue.length === 0) return;
    var batch = queue;
    queue = [];
    timer = null;
    var body = JSON.stringify(batch);
    if (navigator.sendBeacon) {
      if (navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }))) return;
    }
    try {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
      }).catch(function () {});
    } catch {}
  }

  function enqueue(level, args) {
    if (!enabledLevelSet.has(level)) return;

    var serialized = [];
    for (var i = 0; i < args.length; i++) {
      serialized.push(serializeArg(args[i]));
    }
    var entry = { level: level, args: serialized };
    if (app) entry.app = app;
    queue.push(entry);
    if (!timer) timer = setTimeout(flush, BATCH_INTERVAL);
  }

  var methods = ["log", "info", "warn", "error", "debug"];
  for (var m = 0; m < methods.length; m++) {
    (function (method) {
      var original = console[method];
      console[method] = function () {
        enqueue(method, arguments);
        return original.apply(console, arguments);
      };
    })(methods[m]);
  }

  window.addEventListener("error", function (event) {
    enqueue("error", [
      "Uncaught " +
        ((event.error && event.error.name) || "Error") +
        ": " +
        event.message +
        " at " +
        event.filename +
        ":" +
        event.lineno +
        ":" +
        event.colno,
    ]);
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason =
      event.reason instanceof Error
        ? event.reason.name + ": " + event.reason.message
        : String(event.reason);
    enqueue("error", ["Unhandled rejection: " + reason]);
  });

  window.addEventListener("beforeunload", flush);
  window.__logjar = { flush: flush, enqueue: enqueue };
})();
