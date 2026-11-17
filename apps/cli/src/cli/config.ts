import { DEFAULT_PORT } from "../shared/constants.ts";

const MIN_PORT = 0;
const MAX_PORT = 65_535;

export type Environment = Record<string, string | undefined>;

/** A mistake in how logjar was invoked, reported together with the usage text. */
export class UsageError extends Error {}

/**
 * Resolves the log server port: the --port flag, then LOGJAR_PORT, then the
 * default. `portFlag` is the value logjar's own parser read, so a --port that
 * belongs to the wrapped command is never taken.
 */
export function resolveConfiguredPort(
  portFlag: string | undefined,
  environment: Environment = process.env,
): number {
  const source = portFlag === undefined ? "LOGJAR_PORT" : "--port";
  const value = portFlag ?? environment.LOGJAR_PORT ?? String(DEFAULT_PORT);

  if (value.trim() === "") {
    throw invalidPortError(source);
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw invalidPortError(source);
  }

  return port;
}

export function createChildEnvironment(environment: Environment, port: number): NodeJS.ProcessEnv {
  return {
    ...environment,
    LOGJAR_PORT: String(port),
    LOGJAR_URL: `http://localhost:${port}`,
  };
}

function invalidPortError(source: string): UsageError {
  return new UsageError(`Invalid value for ${source}: must be an integer between 0 and 65535`);
}
