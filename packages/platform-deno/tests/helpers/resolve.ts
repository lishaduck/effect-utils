/**
 * A partial polyfill of `importMetaResolve`.
 *
 * A function that returns resolved specifier as if it would be imported using `import(specifier)`.
 *
 * @example
 * ```ts
 * import { assertStringIncludes } from "@std/assert";
 *
 * assertStringIncludes("file://", resolve("./foo.js", import.meta.url));
 * ```
 * @param specifier - A relative path specifier.
 * @returns A `file://` path.
 */
export const resolve = (specifier: string, base: string): string =>
  new URL(specifier, base).toString();
