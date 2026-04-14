/**
 * Deprecation warning emitter with session-level dedup and env-silencing.
 *
 * Emits a single stderr line per unique command-path per session, so that a
 * long-running script running `af paperclip issue list` 100 times doesn't
 * print 100 warnings.
 *
 * Silenced by `AF_SILENCE_DEPRECATIONS=1` so automation that has already
 * acknowledged the deprecation can run cleanly.
 */

const emittedCommands = new Set<string>();

export interface DeprecationOptions {
  /** Fully-qualified command path, e.g. "af paperclip init". Used as dedup key. */
  command: string;
  /** The replacement command the user should migrate to, e.g. "af workforce init". */
  replacement: string;
  /** Optional playbook topic to guide migration, e.g. "migrate-from-paperclip". */
  playbook?: string;
  /** Optional explicit sunset date (ISO YYYY-MM-DD). Surfaced in the warning line. */
  sunset?: string;
}

export function emitDeprecation(opts: DeprecationOptions): void {
  if (process.env["AF_SILENCE_DEPRECATIONS"] === "1") return;
  if (emittedCommands.has(opts.command)) return;
  emittedCommands.add(opts.command);

  const parts = [
    `[deprecated] '${opts.command}' is deprecated.`,
    `Use '${opts.replacement}' instead.`,
  ];
  if (opts.playbook) parts.push(`See: af playbook ${opts.playbook}`);
  if (opts.sunset) parts.push(`Sunset: ${opts.sunset}`);
  parts.push("Silence with AF_SILENCE_DEPRECATIONS=1.");

  console.error(parts.join(" "));
}

/** Only used by tests that want to re-run scenarios that assert on first-emission. */
export function resetDeprecationDedup(): void {
  emittedCommands.clear();
}
