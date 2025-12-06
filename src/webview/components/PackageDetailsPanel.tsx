import React from "react";
import { PackageWithLatest, NuGetSearchResult } from "../../types";

interface PackageDetailsPanelProps {
  // For installed packages
  installedPackage?: PackageWithLatest | null;
  // For browse/search packages
  searchPackage?: NuGetSearchResult | null;
  // Selected version (for browse mode or installed mode version change)
  selectedVersion?: string;
  onVersionChange?: (version: string) => void;
  // Actions
  onUpdate?: (packageName: string, version: string) => void;
  onRemove?: (packageName: string) => void;
  onAdd?: (packageName: string, version?: string) => void;
  // All available versions for installed package (from search API)
  availableVersions?: { version: string; downloads: number }[];
  // Loading/operation state
  operationInProgress?: string | null;
  // Check if package is already installed (for browse mode)
  isAlreadyInstalled?: boolean;
  installedVersion?: string;
  // Utility
  formatDownloadsShort: (count?: number) => string;
  formatDownloadsFull: (count?: number) => string;
}

/**
 * Check if a version string is a pre-release
 */
function isPrerelease(version: string): boolean {
  return version.includes("-");
}

const PackageDetailsPanel: React.FC<PackageDetailsPanelProps> = ({
  installedPackage,
  searchPackage,
  selectedVersion,
  onVersionChange,
  onUpdate,
  onRemove,
  onAdd,
  availableVersions,
  operationInProgress,
  isAlreadyInstalled,
  installedVersion,
  formatDownloadsShort,
  formatDownloadsFull,
}) => {
  const isInstalled = !!installedPackage;
  // isBrowse is true only when we have searchPackage but NOT an installed package
  // (searchPackage can also be used to provide rich data for installed packages)
  const isBrowseOnly = !!searchPackage && !installedPackage;

  // Normalize data from both sources - prefer searchPackage data when available as it's richer
  const packageName = installedPackage?.name || searchPackage?.id || "";
  const packageIcon =
    searchPackage?.iconUrl || installedPackage?.metadata?.iconUrl;
  const isVerified =
    searchPackage?.verified ?? installedPackage?.metadata?.verified;
  const authors =
    searchPackage?.authors || installedPackage?.metadata?.authors || [];
  const description =
    searchPackage?.description || installedPackage?.metadata?.description || "";
  const totalDownloads =
    searchPackage?.totalDownloads || installedPackage?.metadata?.totalDownloads;
  const versions = searchPackage?.versions || availableVersions;
  const projectUrl =
    searchPackage?.projectUrl || installedPackage?.metadata?.projectUrl;
  const licenseUrl =
    searchPackage?.licenseUrl || installedPackage?.metadata?.licenseUrl;
  const licenseExpression = searchPackage?.licenseExpression;
  const tags = searchPackage?.tags || installedPackage?.metadata?.tags;

  // For installed packages, determine if there's an update available
  const hasUpdate = isInstalled && installedPackage?.updateAvailable;
  const currentVersion = installedPackage?.currentVersion || "";
  const latestStableVersion = installedPackage?.latestVersion || "";
  const latestPrereleaseVersion = installedPackage?.prereleaseVersion;

  if (!installedPackage && !searchPackage) {
    return (
      <div className="details-panel-placeholder">
        <div className="placeholder-icon">{isBrowseOnly ? "🔍" : "📦"}</div>
        <p>Select a package to view details</p>
      </div>
    );
  }

  return (
    <div className="package-details-panel">
      {/* Header with Package Info */}
      <div className="details-panel-header-unified">
        <div className="details-panel-header-top">
          {packageIcon && (
            <img
              src={packageIcon}
              alt=""
              className="details-panel-icon"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="details-panel-title">
            <h2>
              {packageName}
              {isVerified && (
                <span className="verified-badge" title="Verified owner">
                  ✓
                </span>
              )}
            </h2>
            {authors.length > 0 && (
              <div className="details-panel-authors">
                by {authors.join(", ")}
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {description && (
          <p className="description-text-inline">{description}</p>
        )}

        {/* Package Metadata */}
        <div className="package-meta-inline">
          {totalDownloads !== undefined && totalDownloads > 0 && (
            <span className="meta-item">
              📥 {formatDownloadsFull(totalDownloads)}
            </span>
          )}
          {isInstalled && installedPackage?.metadata?.publishedDate && (
            <span className="meta-item">
              📅{" "}
              {new Date(
                installedPackage.metadata.publishedDate,
              ).toLocaleDateString()}
            </span>
          )}
          {licenseExpression ? (
            <span className="meta-item">📄 {licenseExpression}</span>
          ) : (
            licenseUrl && (
              <a
                href={licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="meta-item meta-link"
              >
                📄 View License
              </a>
            )
          )}
        </div>

        {/* Project URL */}
        {projectUrl && (
          <div className="project-url-inline">
            <a href={projectUrl} target="_blank" rel="noopener noreferrer">
              🔗 {projectUrl}
            </a>
          </div>
        )}

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="tag-list-inline">
            {tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="details-panel-body">
        {/* Version Section - Unified for both Installed and Browse */}
        <div className="details-panel-section">
          <h3>Version</h3>

          {isInstalled && installedPackage && (
            <div className="version-info-current">
              <span className="label">Currently installed:</span>
              <code className="version-badge">{currentVersion}</code>
            </div>
          )}

          <div className="version-selector-row">
            <select
              id="version-select"
              value={
                selectedVersion ||
                currentVersion ||
                searchPackage?.version ||
                ""
              }
              onChange={(e) => onVersionChange?.(e.target.value)}
              className="version-select"
            >
              {versions && versions.length > 0 ? (
                // Reverse to show newest first
                [...versions].reverse().map((v) => (
                  <option key={v.version} value={v.version}>
                    {v.version}
                    {isPrerelease(v.version) ? " (Pre-Release)" : ""} (
                    {formatDownloadsShort(v.downloads)})
                  </option>
                ))
              ) : (
                <>
                  {isInstalled &&
                    latestStableVersion &&
                    latestStableVersion !== currentVersion && (
                      <option value={latestStableVersion}>
                        {latestStableVersion} (Latest Stable)
                      </option>
                    )}
                  {isInstalled && latestPrereleaseVersion && (
                    <option value={latestPrereleaseVersion}>
                      {latestPrereleaseVersion} (Pre-Release)
                    </option>
                  )}
                  <option
                    value={currentVersion || searchPackage?.version || ""}
                  >
                    {currentVersion || searchPackage?.version || ""}{" "}
                    {isInstalled ? "(Installed)" : "(Latest)"}
                  </option>
                </>
              )}
            </select>
          </div>

          {/* Quick update buttons for installed packages */}
          {isInstalled && hasUpdate && onUpdate && (
            <div className="quick-update-buttons">
              <button
                className="update-to-latest-button"
                onClick={() => onUpdate(packageName, latestStableVersion)}
              >
                ⬆️ Update to Latest ({latestStableVersion})
              </button>
            </div>
          )}
        </div>

        {/* Vulnerabilities - for Installed */}
        {isInstalled &&
          installedPackage?.vulnerabilities &&
          installedPackage.vulnerabilities.length > 0 && (
            <div className="details-panel-section vulnerability-section">
              <h3>🔒 Security Vulnerabilities</h3>
              <div className="vulnerability-list">
                {installedPackage.vulnerabilities.map((vuln, idx) => (
                  <div key={idx} className="vulnerability-item">
                    <span className="vuln-severity">
                      {vuln.severity === 3
                        ? "🔴"
                        : vuln.severity === 2
                          ? "🟠"
                          : vuln.severity === 1
                            ? "🟡"
                            : "⚪"}
                    </span>
                    <span className="vuln-versions">
                      Affects: {vuln.versions}
                    </span>
                    <a
                      href={vuln.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="vuln-link"
                    >
                      Details →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>

      {/* Actions */}
      <div className="details-panel-actions">
        {isInstalled && onRemove && (
          <button
            className="remove-button action-button"
            onClick={() => onRemove(packageName)}
            disabled={!!operationInProgress}
          >
            {operationInProgress === packageName
              ? "⟳ Removing..."
              : "Remove Package"}
          </button>
        )}
        {isInstalled &&
          onUpdate &&
          selectedVersion &&
          selectedVersion !== currentVersion && (
            <button
              className="primary-button"
              onClick={() => onUpdate(packageName, selectedVersion)}
              disabled={!!operationInProgress}
            >
              {operationInProgress === packageName
                ? "⟳ Updating..."
                : `Change to ${selectedVersion}`}
            </button>
          )}
        {isBrowseOnly &&
          onAdd &&
          (isAlreadyInstalled ? (
            <div className="already-installed-notice">
              <span className="installed-badge">✓ Installed</span>
              <span className="installed-version">
                Version {installedVersion}
              </span>
            </div>
          ) : (
            <button
              className="primary-button"
              onClick={() => onAdd(packageName, selectedVersion)}
              disabled={!!operationInProgress}
            >
              {operationInProgress === packageName
                ? "⟳ Adding..."
                : `Add ${packageName}`}
            </button>
          ))}
      </div>

      {/* External Links Section */}
      <div className="details-panel-links">
        <a
          href={`https://www.nuget.org/packages/${packageName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="external-link"
        >
          View on NuGet.org →
        </a>
        <a
          href={`https://nugettrends.com/packages?ids=${packageName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="external-link"
        >
          View on NuGet Trends →
        </a>
      </div>
    </div>
  );
};

export default PackageDetailsPanel;
