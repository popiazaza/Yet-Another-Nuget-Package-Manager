import React from "react";
import { PackageWithLatest, NuGetSearchResult } from "../../types";
import { formatVulnerabilityRange } from "../utils/versionUtils";

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
        <div
          className={`placeholder-icon-codicon ${
            isBrowseOnly ? "search" : "package"
          }`}
        ></div>
        <p>Select a package to view details</p>
      </div>
    );
  }

  return (
    <div className="package-details-panel">
      <div className="details-panel-content">
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
              {tags && tags.length > 0 && (
                <div className="tag-list-header">
                  {tags.map((tag) => (
                    <span key={tag} className="tag-badge">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {description && (
            <p className="description-text-inline">{description}</p>
          )}

          {/* Actions - Fast Access */}
          <div className="details-panel-actions-inline">
{/* Remove button moved to version section */}
            {isInstalled &&
              onUpdate &&
              selectedVersion &&
              selectedVersion !== currentVersion && (
                <button
                  className="primary-button"
                  onClick={() => onUpdate(packageName, selectedVersion)}
                  disabled={!!operationInProgress}
                >
                  {operationInProgress === packageName ? (
                    <>
                      <span className="button-spinner"></span>Updating...
                    </>
                  ) : (
                    `Change to ${selectedVersion}`
                  )}
                </button>
              )}
            {isBrowseOnly &&
              onAdd &&
              (isAlreadyInstalled ? (
                <div className="already-installed-notice">
                  <span className="installed-badge">Installed</span>
                  <span className="installed-version">
                    v{installedVersion}
                  </span>
                </div>
              ) : (
                <button
                  className="primary-button"
                  onClick={() => onAdd(packageName, selectedVersion)}
                  disabled={!!operationInProgress}
                >
                  {operationInProgress === packageName ? (
                    <>
                      <span className="button-spinner"></span>Adding...
                    </>
                  ) : (
                    `Add Package`
                  )}
                </button>
              ))}
          </div>

          {/* Package Metadata */}
          {/* Package Metadata - Grid Layout */}
          <div className="package-meta-grid">
            {totalDownloads !== undefined && totalDownloads > 0 && (
              <div className="meta-badge downloads-badge">
                <span className="meta-label">Downloads:</span>
                <span>{formatDownloadsFull(totalDownloads)}</span>
              </div>
            )}
            
            {licenseExpression ? (
               <div className="meta-badge license-badge" title={licenseExpression}>
                 <span className="meta-icon">⚖</span>
                 <span>{licenseExpression}</span>
               </div>
            ) : (
              licenseUrl && (
                <a href={licenseUrl} target="_blank" rel="noopener noreferrer" className="meta-badge license-badge link">
                  <span className="meta-icon">⚖</span>
                  <span>View License</span>
                </a>
              )
            )}

            <div className="meta-badge links-badge">
                <a href={`https://www.nuget.org/packages/${packageName}`} target="_blank" rel="noopener noreferrer">NuGet.org</a>
                <span className="separator">•</span>
                <a href={`https://nugettrends.com/packages?ids=${packageName}`} target="_blank" rel="noopener noreferrer">Trends</a>
                {projectUrl && (
                    <>
                    <span className="separator">•</span>
                    <a href={projectUrl} target="_blank" rel="noopener noreferrer">Project</a>
                    </>
                )}
            </div>
          </div>

          {/* Tags */}
{/* Tags handled in header */}
        </div>
        <div className="details-panel-body">
{/* Deprecation Warning */}
          {(installedPackage?.metadata?.deprecation || searchPackage?.deprecation) && (
            <div className="deprecation-warning">
                <span className="warning-icon">⚠️</span>
                <div className="warning-content">
                    <strong>This package has been deprecated.</strong>
                    <p>{installedPackage?.metadata?.deprecation?.message || searchPackage?.deprecation?.message || "No deprecation message provided."}</p>
                    {(installedPackage?.metadata?.deprecation?.alternatePackage || searchPackage?.deprecation?.alternatePackage) && (
                        <div className="alternate-package">
                            <span>Alternate: </span>
                            <code>
                                {installedPackage?.metadata?.deprecation?.alternatePackage?.id || searchPackage?.deprecation?.alternatePackage?.id}
                            </code>
                        </div>
                    )}
                </div>
            </div>
          )}

          {/* Release Notes */}
          {(installedPackage?.metadata?.releaseNotes || searchPackage?.releaseNotes) && (
             <div className="details-panel-section">
                <h3>Release Notes</h3>
                <div className="release-notes-content">
                    {installedPackage?.metadata?.releaseNotes || searchPackage?.releaseNotes}
                </div>
             </div>
          )}

          {/* Additional Info Grid */}
           <div className="details-panel-section">
                <h3>Additional Information</h3>
                <div className="info-grid">
                    {(installedPackage?.metadata?.publishedDate || searchPackage?.publishedDate) && (
                        <div className="info-item">
                            <span className="info-label">Published</span>
                            <span className="info-value">
                                {new Date(installedPackage?.metadata?.publishedDate || searchPackage?.publishedDate || "").toLocaleDateString()}
                            </span>
                        </div>
                    )}
                    {(installedPackage?.metadata?.owners || searchPackage?.owners) && (
                        <div className="info-item">
                            <span className="info-label">Owners</span>
                            <span className="info-value">
                                {(installedPackage?.metadata?.owners || (Array.isArray(searchPackage?.owners) ? searchPackage?.owners : [searchPackage?.owners])).join(", ")}
                            </span>
                        </div>
                    )}
                </div>
           </div>

          {/* Version Section - Unified for both Installed and Browse */}
          <div className="details-panel-section">
            <h3>Version Selection</h3>

            {isInstalled && installedPackage && (
              <div className="version-info-current">
                <span className="label">Currently installed:</span>
                <code className="version-badge">{currentVersion}</code>
              </div>
            )}

            <div className="version-control-row">
              <div className="version-selector-wrapper">
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

               {isInstalled && onRemove && (
                 <button 
                    className="remove-link-button"
                    onClick={() => onRemove(packageName)}
                    disabled={!!operationInProgress}
                    title="Uninstall this package"
                 >
                    {operationInProgress === packageName ? "Removing..." : "Remove"}
                 </button>
              )}
            </div>

            {/* Quick update buttons for installed packages */}
            {isInstalled && hasUpdate && onUpdate && (
              <div className="quick-update-buttons">
                <button
                  className="update-to-latest-button"
                  onClick={() => onUpdate(packageName, latestStableVersion)}
                >
                  Update to Latest ({latestStableVersion})
                </button>
              </div>
            )}
          </div>

          {/* Vulnerabilities - for Installed */}
          {isInstalled &&
            installedPackage?.vulnerabilities &&
            installedPackage.vulnerabilities.length > 0 && (
              <div className="details-panel-section vulnerability-section">
                <h3>Security Vulnerabilities</h3>
                <div className="vulnerability-list">
                  {installedPackage.vulnerabilities.map((vuln, idx) => (
                    <div key={idx} className="vulnerability-item">
                      <span
                        className={`severity-badge-inline ${
                          vuln.severity === 3
                            ? "severity-critical"
                            : vuln.severity === 2
                              ? "severity-high"
                              : vuln.severity === 1
                                ? "severity-medium"
                                : "severity-low"
                        }`}
                      ></span>
                      <span className="vuln-versions">
                        Affects: {formatVulnerabilityRange(vuln.versions)}
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
      </div>
    </div>
  );
};

export default PackageDetailsPanel;
