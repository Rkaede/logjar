import { stripVTControlCharacters } from "node:util";
import { formatEntry } from "../shared/constants.ts";
import { createChildEnvironment } from "./config.ts";

export type OutputStream = "stdout" | "stderr";

/**
 * Builds the environment for the wrapped command. Its output is piped through
 * logjar, so most tools turn colour off. When logjar itself writes to a
 * terminal, FORCE_COLOR keeps colour on unless the user already chose.
 */
export function buildChildEnv(
  env: NodeJS.ProcessEnv,
  port: number,
  isTerminal: boolean,
): NodeJS.ProcessEnv {
  const childEnv = createChildEnvironment(env, port);
  if (isTerminal && env.FORCE_COLOR === undefined && env.NO_COLOR === undefined) {
    childEnv.FORCE_COLOR = "1";
  }
  return childEnv;
}

/**
 * Formats a line of the command's output for the log file, without colour
 * codes. Returns undefined for a line that is empty once they are removed.
 *
 * The line is labelled with its stream rather than a level, because many
 * tools write ordinary output to stderr.
 */
export function formatOutputLine(stream: OutputStream, line: string): string | undefined {
  const text = stripVTControlCharacters(line);
  if (text.length === 0) return undefined;
  return formatEntry("be", stream, [text]);
}
