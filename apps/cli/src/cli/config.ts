import { DEFAULT_PORT } from "../shared/constants.ts";

const MIN_PORT = 0;
const MAX_PORT = 65_535;

type Environment = Record<string, string | undefined>;

export function resolveConfiguredPort(
  argv: readonly string[],
  environment: Environment = process.env,
): number {
  const portFlagIndex = argv.indexOf("--port");
  const hasPortFlag = portFlagIndex !== -1;
  const source = hasPortFlag ? "--port" : "LOGJAR_PORT";
  const value = hasPortFlag
    ? argv[portFlagIndex + 1]
    : (environment.LOGJAR_PORT ?? String(DEFAULT_PORT));

  if (value == null || value.trim() === "") {
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

function invalidPortError(source: string): Error {
  return new Error(`[logjar] Invalid value for ${source}: must be an integer between 0 and 65535`);
}
