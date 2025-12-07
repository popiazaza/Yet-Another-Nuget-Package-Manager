export interface Package {
  name: string;
  currentVersion: string;
}

export interface VulnerabilityInfo {
  severity: number;
  url: string;
  versions: string;
}

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

export type UpdateType = "major" | "minor" | "patch" | "prerelease" | "none";

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
  source?: string;
}

export interface RemovePackageOptions {
  projectPath: string;
  packageName: string;
}

export interface NuGetSource {
  name: string;
  url: string;
  isEnabled: boolean;
  isDefault?: boolean;
}

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
  items?: string[];
  tags?: string[];
  releaseNotes?: string;
  publishedDate?: string;
  owners?: string[];
  deprecation?: {
    message?: string;
    reasons?: string[];
    alternatePackage?: {
      id: string;
      range?: string;
    };
  };
}
