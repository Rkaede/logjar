import {
  DEFAULT_LOG_FILE,
  DEFAULT_MAX_AGE_MS,
  DEFAULT_MAX_SIZE_BYTES,
  DEFAULT_PORT,
} from "../shared/constants.ts";
import { resolveConfiguredPort, UsageError, type Environment } from "./config.ts";

export { UsageError };

export interface CliOptions {
  port: number;
  logFile: string;
  maxAgeMs: number;
  maxSizeBytes: number;
  command: string[];
}

export const USAGE = `Usage: logjar [options] -- <command>

Options:
  --port <n>       HTTP port for frontend logs  (env: LOGJAR_PORT; default: ${DEFAULT_PORT}; 0: auto)
  --out <path>     Log file path                (default: ${DEFAULT_LOG_FILE})
  --max-age <s>    Rolling window in seconds    (default: ${DEFAULT_MAX_AGE_MS / 1000})
  --max-size <kb>  Max log file size in KB      (default: ${DEFAULT_MAX_SIZE_BYTES / 1024})
  -h, --help       Show this help

Example:
  logjar -- turbo run dev --parallel`;

const VALUE_FLAGS = new Set(["--port", "--out", "--max-age", "--max-size"]);

/**
 * Parses logjar's own options, which must come before the command. Parsing
 * stops at `--` or at the first argument that is not an option, so the
 * command keeps flags such as `--port` for itself.
 */
export function parseArgs(
  argv: readonly string[],
  environment: Environment = process.env,
): CliOptions | "help" {
  const values = new Map<string, string>();
  let command: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--") {
      command = argv.slice(i + 1);
      break;
    }
    if (arg === "-h" || arg === "--help") return "help";
    if (!arg.startsWith("-")) {
      command = argv.slice(i);
      break;
    }

    const equalsIdx = arg.indexOf("=");
    const name = equalsIdx === -1 ? arg : arg.slice(0, equalsIdx);
    if (!VALUE_FLAGS.has(name)) {
      throw new UsageError(`Unknown option: ${arg}`);
    }

    const value = equalsIdx === -1 ? argv[++i] : arg.slice(equalsIdx + 1);
    if (value === undefined || value === "--") {
      throw new UsageError(`Missing value for ${name}`);
    }
    values.set(name, value);
  }

  if (command.length === 0) {
    throw new UsageError("Missing command to run");
  }

  return {
    port: resolveConfiguredPort(values.get("--port"), environment),
    logFile: values.get("--out") ?? DEFAULT_LOG_FILE,
    maxAgeMs: positiveNumber(values, "--max-age", DEFAULT_MAX_AGE_MS / 1000) * 1000,
    maxSizeBytes: positiveNumber(values, "--max-size", DEFAULT_MAX_SIZE_BYTES / 1024) * 1024,
    command,
  };
}

function positiveNumber(values: Map<string, string>, name: string, fallback: number): number {
  const raw = values.get(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (raw === "" || !Number.isFinite(value) || value <= 0) {
    throw new UsageError(`Invalid value for ${name}: must be a positive number`);
  }
  return value;
}

/**
 * Builds the command line handed to the shell.
 *
 * A single argument is taken as a complete shell command, so
 * `logjar -- "npm run a && npm run b"` works. Several arguments were already
 * split by the caller's shell, so each one is quoted to reach the command
 * unchanged. On Windows they are joined as they are, because cmd.exe has no
 * quoting that is safe for every program.
 */
export function toShellCommand(
  command: readonly string[],
  platform: string = process.platform,
): string {
  if (command.length === 1) return command[0];
  if (platform === "win32") return command.join(" ");
  return command.map(quotePosixArg).join(" ");
}

function quotePosixArg(arg: string): string {
  if (/^[\w@%+=:,./-]+$/.test(arg)) return arg;
  return `'${arg.replaceAll("'", "'\\''")}'`;
}
