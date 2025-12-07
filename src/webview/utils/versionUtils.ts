/**
 * Utilities for working with NuGet versions and ranges
 */

/**
 * Format a NuGet vulnerability version range into a human-readable string
 * NuGet uses interval notation:
 * 1.0 = (exact) 1.0 (actually normally means >= 1.0 in NuGet but for vulns usually means exact or starting from)
 * [1.0] = exact 1.0
 * (1.0,) = > 1.0
 * [1.0,) = >= 1.0
 * (,1.0) = < 1.0
 * (,1.0] = <= 1.0
 * (1.0, 2.0) = > 1.0 and < 2.0
 * [1.0, 2.0] = >= 1.0 and <= 2.0
 */
export function formatVulnerabilityRange(range: string): string {
  if (!range) return "";

  const trimmed = range.trim();

  // Basic check for interval notation
  const intervalMatch = trimmed.match(/^([\[\(])([^,]*),?\s*([^\]\)]*)([\]\)])$/);

  if (!intervalMatch) {
    // strict version or invalid format, return as is
    return trimmed;
  }

  const [, leftBracket, minVer, maxVer, rightBracket] = intervalMatch;
  const min = minVer.trim();
  const max = maxVer.trim();
  const minInclusive = leftBracket === "[";
  const maxInclusive = rightBracket === "]";

  // Case: Exact match [1.0.0]
  if (min && max && min === max && minInclusive && maxInclusive) {
    return `Exact ${min}`;
  }

  // Case: No max version (e.g., ">= 1.0.0" or "> 1.0.0")
  if (min && !max) {
    return `${minInclusive ? ">= " : "> "}${min}`;
  }

  // Case: No min version (e.g., "<= 1.0.0" or "< 1.0.0")
  if (!min && max) {
    return `${maxInclusive ? "<= " : "< "}${max}`;
  }

  // Case: Range
  if (min && max) {
    const minOp = minInclusive ? ">=" : ">";
    const maxOp = maxInclusive ? "<=" : "<";
    return `${minOp} ${min} && ${maxOp} ${max}`;
  }

  return trimmed;
}
