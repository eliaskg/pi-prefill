/**
 * Glob matching for provider entries.
 *
 * A pattern supports one metacharacter: "*" matches any run of characters,
 * including dots and dashes. Every other character is literal. Matching is
 * case-insensitive.
 *
 *   "llama.cpp"  exact id
 *   "local-*"    prefix, e.g. a dynamically registered "local-<hash>"
 *   "*-local"    suffix
 *   "*"          every provider
 */

const STAR = "*";

/**
 * Compile a provider pattern to an anchored RegExp. Escapes every regex
 * metacharacter, then turns "*" into ".*". The result carries the "i" flag,
 * so callers test the provider id as-is.
 */
export function globToRegExp(pattern: string): RegExp {
  const source = pattern
    .split(STAR)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`, "i");
}

/**
 * True when the value matches at least one compiled pattern.
 * An empty pattern list matches nothing.
 */
export function matchesAny(patterns: readonly RegExp[], value: string): boolean {
  return patterns.some((re) => re.test(value));
}
