/**
 * NuGet.org API client with in-memory caching
 * Fetches latest versions of packages from NuGet.org V3 API
 */

import { PackageMetadata, NuGetSource, UpdateType } from "../types";

/**
 * Cache entry for package versions
 */
interface CacheEntry {
  versions: string[];
  timestamp: number;
}

/**
 * Cache entry for package metadata
 */
interface MetadataCacheEntry {
  metadata: PackageMetadata;
  timestamp: number;
}

// In-memory cache for package versions
const versionCache = new Map<string, CacheEntry>();

// In-memory cache for package metadata
const metadataCache = new Map<string, MetadataCacheEntry>();

// Pending requests map for request coalescing
const pendingRequests = new Map<string, Promise<string[]>>();

// TTL for cache entries (1 hour in milliseconds)
const CACHE_TTL_MS = 60 * 60 * 1000;

// NuGet.org V3 API endpoints
const NUGET_API_BASE = "https://api.nuget.org/v3-flatcontainer";
const NUGET_SEARCH_API = "https://azuresearch-usnc.nuget.org/query";
const NUGET_SERVICE_INDEX = "https://api.nuget.org/v3/index.json";
const NUGET_REGISTRATION_BASE =
  "https://api.nuget.org/v3/registration5-gz-semver2";

/**
 * Vulnerability information for a package
 */
export interface VulnerabilityInfo {
  severity: number; // 0=low, 1=medium, 2=high, 3=critical
  url: string;
  versions: string;
}

/**
 * Cache for vulnerability data
 */
interface VulnerabilityCache {
  data: Map<string, VulnerabilityInfo[]>;
  timestamp: number;
}

let vulnerabilityCache: VulnerabilityCache | null = null;
const VULNERABILITY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Search result from NuGet API
 */
export interface NuGetSearchResult {
  id: string;
  version: string;
  description: string;
  authors: string[];
  totalDownloads: number;
  verified: boolean;
  iconUrl?: string;
  versions?: { version: string; downloads: number }[];
  projectUrl?: string;
  licenseUrl?: string;
  licenseExpression?: string;
  tags?: string[];
}

/**
 * Search for packages on NuGet.org
 * @param query - Search query
 * @param take - Number of results to return (default 20)
 * @param includePrerelease - Whether to include prerelease versions
 * @param source - Optional custom NuGet source
 * @returns Promise with array of search results
 */
export async function searchPackages(
  query: string,
  take: number = 20,
  includePrerelease: boolean = false,
  source?: NuGetSource,
): Promise<NuGetSearchResult[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  try {
    const searchUrl = source?.url ? `${source.url}/query` : NUGET_SEARCH_API;
    const params = new URLSearchParams({
      q: query.trim(),
      take: take.toString(),
      prerelease: includePrerelease.toString(),
      semVerLevel: "2.0.0",
    });

    const response = await fetch(`${searchUrl}?${params}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data?: Array<{
        id: string;
        version: string;
        description?: string;
        authors?: string[];
        totalDownloads?: number;
        verified?: boolean;
        iconUrl?: string;
        versions?: Array<{ version: string; downloads: number }>;
        projectUrl?: string;
        licenseUrl?: string;
        licenseExpression?: string;
        tags?: string[];
      }>;
    };

    return (data.data || []).map((item) => ({
      id: item.id,
      version: item.version,
      description: item.description || "",
      authors: item.authors || [],
      totalDownloads: item.totalDownloads || 0,
      verified: item.verified || false,
      iconUrl: item.iconUrl,
      versions: item.versions,
      projectUrl: item.projectUrl,
      licenseUrl: item.licenseUrl,
      licenseExpression: item.licenseExpression,
      tags: item.tags,
    }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to search packages: ${errorMessage}`);
    return [];
  }
}

/**
 * Get detailed package metadata including release notes
 * @param packageId - The NuGet package ID
 * @param version - Optional specific version (defaults to latest)
 * @returns Promise with package metadata
 */
export async function getPackageMetadata(
  packageId: string,
  version?: string,
): Promise<PackageMetadata | null> {
  const cacheKey = `${packageId.toLowerCase()}:${version || "latest"}`;

  // Check cache first
  const cached = metadataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.metadata;
  }

  try {
    // Get version to fetch if not specified
    const targetVersion = version || (await getLatestVersion(packageId));
    if (!targetVersion) {
      return null;
    }

    // Fetch from NuGet registration API for detailed metadata
    const registrationUrl = `${NUGET_REGISTRATION_BASE}/${packageId.toLowerCase()}/${targetVersion.toLowerCase()}.json`;
    const response = await fetch(registrationUrl, {
      headers: { "Accept-Encoding": "gzip" },
    });

    if (!response.ok) {
      // Try alternative approach using search API
      return await getPackageMetadataFromSearch(packageId, targetVersion);
    }

    const data = (await response.json()) as {
      catalogEntry?: {
        id: string;
        version: string;
        description?: string;
        authors?: string;
        owners?: string;
        projectUrl?: string;
        licenseUrl?: string;
        iconUrl?: string;
        tags?: string[];
        releaseNotes?: string;
        published?: string;
        deprecation?: {
          message?: string;
          reasons?: string[];
          alternatePackage?: {
            id: string;
            range?: string;
          };
        };
      };
      listed?: boolean;
    };

    if (!data.catalogEntry) {
      return await getPackageMetadataFromSearch(packageId, targetVersion);
    }

    const entry = data.catalogEntry;
    const metadata: PackageMetadata = {
      id: entry.id || packageId,
      version: entry.version || targetVersion,
      description: entry.description || "",
      authors: entry.authors
        ? entry.authors.split(",").map((a) => a.trim())
        : [],
      owners: entry.owners
        ? entry.owners.split(",").map((o) => o.trim())
        : undefined,
      projectUrl: entry.projectUrl,
      licenseUrl: entry.licenseUrl,
      iconUrl: entry.iconUrl,
      tags: entry.tags,
      totalDownloads: 0, // Will be enriched from search API
      verified: false, // Will be enriched from search API
      releaseNotes: entry.releaseNotes,
      publishedDate: entry.published,
      deprecation: entry.deprecation,
    };

    // Enrich with data from search API (downloads, verified status)
    try {
      const searchResults = await searchPackages(packageId, 1, true);
      const searchMatch = searchResults.find(
        (r) => r.id.toLowerCase() === packageId.toLowerCase(),
      );
      if (searchMatch) {
        metadata.totalDownloads = searchMatch.totalDownloads;
        metadata.verified = searchMatch.verified;
        if (!metadata.iconUrl) {
          metadata.iconUrl = searchMatch.iconUrl;
        }
        if (!metadata.projectUrl) {
          metadata.projectUrl = searchMatch.projectUrl;
        }
        if (!metadata.licenseUrl) {
          metadata.licenseUrl = searchMatch.licenseUrl;
        }
        if (!metadata.tags || metadata.tags.length === 0) {
          metadata.tags = searchMatch.tags;
        }
      }
    } catch {
      // Ignore errors enriching from search API
    }

    // Cache the result
    metadataCache.set(cacheKey, { metadata, timestamp: Date.now() });

    return metadata;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to fetch metadata for ${packageId}: ${errorMessage}`);
    return await getPackageMetadataFromSearch(packageId, version);
  }
}

/**
 * Fallback to get metadata from search API
 */
async function getPackageMetadataFromSearch(
  packageId: string,
  version?: string,
): Promise<PackageMetadata | null> {
  try {
    const results = await searchPackages(packageId, 1, true);
    const match = results.find(
      (r) => r.id.toLowerCase() === packageId.toLowerCase(),
    );

    if (!match) {
      return null;
    }

    return {
      id: match.id,
      version: version || match.version,
      description: match.description,
      authors: match.authors,
      totalDownloads: match.totalDownloads,
      verified: match.verified,
      iconUrl: match.iconUrl,
      projectUrl: match.projectUrl,
      licenseUrl: match.licenseUrl,
      tags: match.tags,
    };
  } catch {
    return null;
  }
}

/**
 * Determine the update type between two versions
 */
export function getUpdateType(
  currentVersion: string,
  newVersion: string,
): UpdateType {
  if (!newVersion || currentVersion === newVersion) {
    return "none";
  }

  const current = parseVersion(currentVersion);
  const updated = parseVersion(newVersion);

  // Check if new version is prerelease
  if (updated.prerelease && !current.prerelease) {
    return "prerelease";
  }

  // Compare major versions
  if ((updated.parts[0] || 0) > (current.parts[0] || 0)) {
    return "major";
  }

  // Compare minor versions
  if ((updated.parts[1] || 0) > (current.parts[1] || 0)) {
    return "minor";
  }

  // Compare patch versions
  if ((updated.parts[2] || 0) > (current.parts[2] || 0)) {
    return "patch";
  }

  // Prerelease updates
  if (current.prerelease && updated.prerelease) {
    return "prerelease";
  }

  return "patch";
}

/**
 * Check if a version string is a prerelease version
 * Prerelease versions contain a hyphen (e.g., 1.0.0-preview, 1.0.0-beta.1)
 */
function isPrerelease(version: string): boolean {
  return version.includes("-");
}

/**
 * Parse a version string into its components
 * Returns { major, minor, patch, prerelease }
 */
function parseVersion(version: string): {
  parts: number[];
  prerelease: string | null;
} {
  // Split on hyphen to separate version from prerelease tag
  const [versionPart, ...prereleaseParts] = version.split("-");
  const prerelease =
    prereleaseParts.length > 0 ? prereleaseParts.join("-") : null;

  // Parse numeric parts, handling non-numeric segments
  const parts = versionPart.split(".").map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });

  return { parts, prerelease };
}

/**
 * Compare two version strings
 * Returns: negative if a < b, positive if a > b, 0 if equal
 * Stable versions are considered greater than prerelease versions of the same base version
 */
export function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);

  // Compare numeric parts first
  const maxLength = Math.max(parsedA.parts.length, parsedB.parts.length);
  for (let i = 0; i < maxLength; i++) {
    const partA = parsedA.parts[i] || 0;
    const partB = parsedB.parts[i] || 0;
    if (partA !== partB) {
      return partA - partB;
    }
  }

  // If numeric parts are equal, stable version wins over prerelease
  // e.g., 10.0.0 > 10.0.0-preview.7
  if (parsedA.prerelease === null && parsedB.prerelease !== null) {
    return 1; // a is stable, b is prerelease -> a wins
  }
  if (parsedA.prerelease !== null && parsedB.prerelease === null) {
    return -1; // a is prerelease, b is stable -> b wins
  }

  // Both are prereleases or both are stable - compare prerelease strings
  if (parsedA.prerelease && parsedB.prerelease) {
    return parsedA.prerelease.localeCompare(parsedB.prerelease);
  }

  return 0;
}

/**
 * Check if a cache entry is still valid
 * @param entry - Cache entry to check
 * @returns True if entry is still valid (not expired)
 */
function isCacheValid(entry: CacheEntry): boolean {
  const now = Date.now();
  return now - entry.timestamp < CACHE_TTL_MS;
}

/**
 * Get all versions of a package from cache or fetch from API
 * @param packageId - The NuGet package ID
 * @returns Promise with array of version strings, sorted descending (latest first)
 */
export async function getPackageVersions(packageId: string): Promise<string[]> {
  // Check cache first
  const cached = versionCache.get(packageId.toLowerCase());
  if (cached && isCacheValid(cached)) {
    return cached.versions;
  }

  try {
    // Fetch from NuGet API
    const url = `${NUGET_API_BASE}/${packageId.toLowerCase()}/index.json`;
    
    // Check for pending request
    const pending = pendingRequests.get(packageId.toLowerCase());
    if (pending) {
      return pending;
    }

    const fetchPromise = (async () => {
      try {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as { versions?: string[] };
        const versions = data.versions || [];

        // Sort versions in descending order (latest stable first, then prereleases)
        versions.sort((a, b) => {
          return compareVersions(b, a); // Descending order
        });

        // Cache the result
        versionCache.set(packageId.toLowerCase(), {
          versions,
          timestamp: Date.now(),
        });

        return versions;
      } finally {
        // Remove from pending requests when done (success or failure)
        pendingRequests.delete(packageId.toLowerCase());
      }
    })();

    pendingRequests.set(packageId.toLowerCase(), fetchPromise);
    return fetchPromise;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to fetch versions for ${packageId}: ${errorMessage}`);
    return [];
  }
}

/**
 * Get the latest stable version of a package
 * Falls back to latest prerelease if no stable version exists
 * @param packageId - The NuGet package ID
 * @returns Promise with latest version string, or empty string if not found
 */
export async function getLatestVersion(packageId: string): Promise<string> {
  const versions = await getPackageVersions(packageId);
  if (versions.length === 0) {
    return "";
  }

  // Find the first stable version (versions are already sorted with stable first)
  const stableVersion = versions.find((v) => !isPrerelease(v));
  return stableVersion || versions[0];
}

/**
 * Get the latest prerelease version of a package
 * @param packageId - The NuGet package ID
 * @returns Promise with latest prerelease version string, or empty string if not found
 */
export async function getLatestPrereleaseVersion(
  packageId: string,
): Promise<string> {
  const versions = await getPackageVersions(packageId);
  if (versions.length === 0) {
    return "";
  }

  // Find the first prerelease version
  const prereleaseVersion = versions.find((v) => isPrerelease(v));
  return prereleaseVersion || "";
}

/**
 * Check if a version is a prerelease
 */
export function isPrereleaseVersion(version: string): boolean {
  return isPrerelease(version);
}

/**
 * Get latest versions for multiple packages in parallel
 * @param packageIds - Array of package IDs
 * @returns Promise with map of packageId -> latestVersion
 */
export async function getLatestVersions(
  packageIds: string[],
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  const promises = packageIds.map(async (id) => {
    const version = await getLatestVersion(id);
    return { id, version };
  });

  const resolved = await Promise.all(promises);

  for (const { id, version } of resolved) {
    results.set(id, version);
  }

  return results;
}

/**
 * Clear the version cache (useful for testing or manual refresh)
 */
export function clearCache(): void {
  versionCache.clear();
}

/**
 * Clear expired cache entries
 */
export function clearExpiredCache(): void {
  for (const [key, entry] of versionCache.entries()) {
    if (!isCacheValid(entry)) {
      versionCache.delete(key);
    }
  }
}

/**
 * Get cache statistics (useful for debugging)
 */
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: versionCache.size,
    entries: Array.from(versionCache.keys()),
  };
}

/**
 * Fetch vulnerability data from NuGet.org
 */
async function fetchVulnerabilityData(): Promise<
  Map<string, VulnerabilityInfo[]>
> {
  const vulnerabilities = new Map<string, VulnerabilityInfo[]>();

  try {
    // Get service index to find vulnerability endpoint
    const serviceIndexResponse = await fetch(NUGET_SERVICE_INDEX);
    if (!serviceIndexResponse.ok) {
      throw new Error(
        `Failed to fetch service index: ${serviceIndexResponse.status}`,
      );
    }

    const serviceIndex = (await serviceIndexResponse.json()) as {
      resources?: Array<{ "@type": string; "@id": string }>;
    };

    // Find VulnerabilityInfo resource
    const vulnResource = serviceIndex.resources?.find(
      (r) => r["@type"] === "VulnerabilityInfo/6.7.0",
    );

    if (!vulnResource) {
      console.log("VulnerabilityInfo resource not found in service index");
      return vulnerabilities;
    }

    // Fetch vulnerability index
    const indexResponse = await fetch(vulnResource["@id"]);
    if (!indexResponse.ok) {
      throw new Error(
        `Failed to fetch vulnerability index: ${indexResponse.status}`,
      );
    }

    const vulnIndex = (await indexResponse.json()) as Array<{
      "@name": string;
      "@id": string;
      "@updated": string;
    }>;

    // Fetch all vulnerability pages
    const pagePromises = vulnIndex.map(async (page) => {
      try {
        const pageResponse = await fetch(page["@id"]);
        if (!pageResponse.ok) {
          return null;
        }
        return (await pageResponse.json()) as Record<
          string,
          VulnerabilityInfo[]
        >;
      } catch {
        return null;
      }
    });

    const pages = await Promise.all(pagePromises);

    // Merge all vulnerability data
    for (const page of pages) {
      if (page) {
        for (const [packageId, vulns] of Object.entries(page)) {
          const existing = vulnerabilities.get(packageId) || [];
          vulnerabilities.set(packageId, [...existing, ...vulns]);
        }
      }
    }

    return vulnerabilities;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to fetch vulnerability data: ${errorMessage}`);
    return vulnerabilities;
  }
}

/**
 * Get vulnerability information for a package
 * @param packageId - Package ID to check
 * @param version - Current version of the package
 * @returns Array of vulnerabilities affecting this version
 */
export async function getVulnerabilities(
  packageId: string,
  version: string,
): Promise<VulnerabilityInfo[]> {
  // Check cache
  if (
    vulnerabilityCache &&
    Date.now() - vulnerabilityCache.timestamp < VULNERABILITY_CACHE_TTL_MS
  ) {
    const vulns = vulnerabilityCache.data.get(packageId.toLowerCase()) || [];
    return vulns.filter((v) => isVersionInRange(version, v.versions));
  }

  // Fetch fresh data
  const data = await fetchVulnerabilityData();
  vulnerabilityCache = {
    data,
    timestamp: Date.now(),
  };

  const vulns = data.get(packageId.toLowerCase()) || [];
  return vulns.filter((v) => isVersionInRange(version, v.versions));
}

/**
 * Check if a version falls within a NuGet version range
 * Simplified implementation for common range patterns
 */
function isVersionInRange(version: string, range: string): boolean {
  // Parse range - NuGet uses interval notation: (, ), [, ]
  // Examples: "(, 2.0.0)", "[1.0.0, 2.0.0)", "(1.0.0, )"

  const rangeMatch = range.match(/^([\[\(])([^,]*),\s*([^\]\)]*)([\]\)])$/);
  if (!rangeMatch) {
    return false;
  }

  const [, minBracket, minVersion, maxVersion, maxBracket] = rangeMatch;
  const minInclusive = minBracket === "[";
  const maxInclusive = maxBracket === "]";

  // Check minimum version
  if (minVersion.trim()) {
    const cmp = compareVersions(version, minVersion.trim());
    if (minInclusive ? cmp < 0 : cmp <= 0) {
      return false;
    }
  }

  // Check maximum version
  if (maxVersion.trim()) {
    const cmp = compareVersions(version, maxVersion.trim());
    if (maxInclusive ? cmp > 0 : cmp >= 0) {
      return false;
    }
  }

  return true;
}

/**
 * Get severity label from severity number
 */
export function getSeverityLabel(severity: number): string {
  switch (severity) {
    case 0:
      return "Low";
    case 1:
      return "Medium";
    case 2:
      return "High";
    case 3:
      return "Critical";
    default:
      return "Unknown";
  }
}

/**
 * Get severity emoji from severity number
 */
export function getSeverityEmoji(severity: number): string {
  switch (severity) {
    case 0:
      return "🟡"; // Low
    case 1:
      return "🟠"; // Medium
    case 2:
      return "🔴"; // High
    case 3:
      return "⛔"; // Critical
    default:
      return "⚠️";
  }
}
