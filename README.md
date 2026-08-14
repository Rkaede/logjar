# Logjar

Unified frontend + backend log capture for dev environments. A single rolling log file that coding agents (Claude, Cursor, Copilot, etc.) can read to understand what's happening in your app.

## The Problem

When a coding agent is helping you debug, it can't see your terminal output or browser console. You end up copy-pasting error messages back and forth. **Logjar** fixes this by writing all logs (backend stdout/stderr _and_ frontend console output) into one small, rolling file the agent can read directly.

## Quick Start

```bash
npm install logjar --save-dev
```

### 1. Wrap your dev command

```bash
# Before
turbo run dev --parallel

# After
npx logjar -- turbo run dev --parallel
```

That's it for the backend. All stdout/stderr from your command is captured.

The HTTP port can also be configured with `LOGJAR_PORT`:

```bash
LOGJAR_PORT=9000 npx logjar -- npm run dev
```

An explicit `--port` takes precedence over `LOGJAR_PORT`, which takes precedence over the default
port `8797`. Ports must be integers from `0` through `65535`. Use port `0` to let the operating
system choose an available port:

```bash
npx logjar --port 0 -- npm run dev
```

Logjar waits for the HTTP server to listen, then provides the resolved port to the wrapped command
as `LOGJAR_PORT` (and in the existing `LOGJAR_URL`). This means a wrapped command receives the real
ephemeral port rather than `0`.

### 2. Add frontend capture

Choose one of these options:

**Option A: ES module import** (React, Vue, Svelte, etc.)

```js
// Add to your app's entry point (e.g., main.ts, _app.tsx)
import "logjar/client";

// Or initialize with custom options
import { initLogjar } from "logjar/client";
initLogjar({ app: "web", levels: ["log", "info", "warn", "error", "debug"] });
```

Browser code cannot read the wrapped command's environment automatically. When using a custom or
ephemeral port, expose `LOGJAR_PORT` through your application's normal public-runtime or bundler
configuration and pass it to the client:

```js
import { initLogjar } from "logjar/client";

initLogjar({ port: import.meta.env.LOGJAR_PORT });
```

For example, a Vite application launched by Logjar can explicitly map the injected variable in its
own `vite.config.ts` without Logjar defining a `VITE_*` variable:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "import.meta.env.LOGJAR_PORT": JSON.stringify(process.env.LOGJAR_PORT),
  },
});
```

**Option B: Script tag**

```html
<script src="./node_modules/logjar/src/client/snippet.js"></script>
```

**Option C: Conditional (only in dev)**

```js
if (process.env.NODE_ENV === "development") {
  import("logjar/client");
}
```

**Option D: Chrome/Chromium extension** (no app code changes)

If you do not want to import `logjar/client` into the app, you can use the optional browser extension instead. Download the latest asset from [GitHub Releases](https://github.com/Rkaede/logjar/releases), extract it, then load it locally:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the extracted extension folder.

Then start Logjar locally, open your app in the browser, click the Logjar extension, confirm the port matches your CLI process (default `8797`), and enable **Capture this tab**.

The extension captures browser logs for the current tab and forwards them to your local Logjar server. This is useful when you want frontend capture without changing application code.

### 3. Tell your coding agent

Add the following to your `AGENTS.md` / `CLAUDE.md` / `.cursorrules`:

```
Read .logjar/logs.txt to check for frontend and backend errors.
```

## 4. Update your .gitignore

Update your `.gitignore` to exclude the logjar directory:

```
.logjar
```

## CLI Options

```
logjar [options] -- <command>

Options:
  --port <n>       HTTP port for frontend logs  (env: LOGJAR_PORT; default: 8797; 0: auto)
  --out <path>     Log file path                (default: .logjar/logs.txt)
  --max-age <s>    Rolling window in seconds    (default: 900)
  --max-size <kb>  Max log file size in KB      (default: 200)
```

### Examples

```bash
# Custom port and output
logjar --port 9000 --out logs/dev.txt -- npm run dev

# Longer window, bigger cap
logjar --max-age 600 --max-size 100 -- next dev

# Add to package.json scripts
{
  "scripts": {
    "dev": "logjar -- turbo run dev --parallel"
  }
}
```

## License

MIT
