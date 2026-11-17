export interface Patch {
  install(): void;
  uninstall(): void;
}

/**
 * Wraps `target[key]` on install and puts the original back on uninstall.
 *
 * If something else has wrapped the method since, uninstall leaves it alone,
 * because removing our wrapper would remove theirs too. Ours stays in the
 * chain, and a later install keeps using it instead of wrapping again.
 */
export function patchMethod<T extends object, K extends keyof T>(
  target: T,
  key: K,
  wrap: (original: T[K]) => T[K],
): Patch {
  let original: T[K];
  let wrapper: T[K] | undefined;

  return {
    install() {
      if (wrapper) return;
      original = target[key];
      wrapper = wrap(original);
      target[key] = wrapper;
    },
    uninstall() {
      if (!wrapper || target[key] !== wrapper) return;
      target[key] = original;
      wrapper = undefined;
    },
  };
}
