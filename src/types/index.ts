/**
 * Shared message types between extension and webview
 */

export interface Package {
  name: string;
  currentVersion: string;
}

/**
 * Vulnerability information for a package
 */
export interface VulnerabilityInfo {
  severity: number; // 0=low, 1=medium, 2=high, 3=critical
  url: string;
  versions: string;
}

/**
 * Package metadata from NuGet API
 */
export interface PackageMetadata {
  id: string;
  version: string;
  description: string;
  authors: string[];
  owners?: string[];
  projectUrl?: string;
  licenseUrl?: string;
  iconUrl?: string;
  tags?: string[];
  totalDownloads: number;
  verified: boolean;
  releaseNotes?: string;
  publishedDate?: string;
  deprecation?: {
    message?: string;
    reasons?: string[];
    alternatePackage?: {
      id: string;
      range?: string;
    };
  };
}

/**
 * Update type classification
 */
export type UpdateType = 'major' | 'minor' | 'patch' | 'prerelease' | 'none';

export interface PackageWithLatest extends Package {
  latestVersion: string;
  updateAvailable: boolean;
  updateType?: UpdateType;
  metadata?: PackageMetadata;
  vulnerabilities?: VulnerabilityInfo[];
  prereleaseVersion?: string;
}

export interface PackageReference {
  name: string;
  currentVersion: string;
  latestVersion?: string;
  isUpdateAvailable?: boolean;
  updateType?: UpdateType;
  metadata?: PackageMetadata;
  vulnerabilities?: VulnerabilityInfo[];
  prereleaseVersion?: string;
}

/**
 * Project information for multi-project support
 */
export interface ProjectInfo {
  path: string;
  name: string;
  packages: PackageReference[];
}

export interface ParseCsprojResult {
  packages: PackageReference[];
  projectPath: string;
  error?: string;
}

export interface DotnetCliResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: Error;
}

export interface AddPackageOptions {
  projectPath: string;
  packageName: string;
  version?: string;
  prerelease?: boolean;
  source?: string; // Custom NuGet source
}

export interface RemovePackageOptions {
  projectPath: string;
  packageName: string;
}

/**
 * NuGet source configuration
 */
export interface NuGetSource {
  name: string;
  url: string;
  isEnabled: boolean;
  isDefault?: boolean;
}

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

export type ExtensionMessage = 
  | { type: 'packageListUpdate'; data: PackageWithLatest[]; packages?: PackageReference[]; projectPath?: string; projects?: ProjectInfo[] }
  | { type: 'error'; message: string; error?: string; details?: string }
  | { type: 'operationComplete'; success: boolean; message?: string; packages?: PackageReference[] }
  | { type: 'loading'; message: string }
  | { type: 'searchResults'; results: NuGetSearchResult[] }
  | { type: 'packageMetadata'; packageName: string; metadata: PackageMetadata }
  | { type: 'packageVersions'; packageName: string; versions: { version: string; downloads: number }[]; searchData?: NuGetSearchResult }
  | { type: 'projectList'; projects: ProjectInfo[] };

export type WebviewMessage =
  | { command: 'addPackage'; packageName: string; version?: string; projectPath?: string }
  | { command: 'removePackage'; packageName: string; projectPath?: string }
  | { command: 'updatePackage'; packageName: string; version: string; projectPath?: string }
  | { command: 'refresh' }
  | { command: 'searchPackages'; query: string; includePrerelease?: boolean }
  | { command: 'getPackageMetadata'; packageName: string }
  | { command: 'getPackageVersions'; packageName: string }
  | { command: 'selectProject'; projectPath: string }
  | { command: 'upgradeAllPackages'; mode: 'all' | 'minor' | 'major' };
