import React from "react";
import { PackageWithLatest } from "../../types";

interface PackageDetailsModalProps {
  package: PackageWithLatest;
  onClose: () => void;
  onUpdate: (packageName: string, version: string) => void;
}

/**
 * Get severity label
 */
function getSeverityLabel(severity: number): string {
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
 * Get severity icon
 */
function getSeverityIcon(severity: number): string {
  switch (severity) {
    case 0:
      return "⚪";
    case 1:
      return "🟡";
    case 2:
      return "🟠";
    case 3:
      return "🔴";
    default:
      return "⚠️";
  }
}

/**
 * Format download count
 */
function formatDownloads(count?: number): string {
  if (!count) return "N/A";
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

const PackageDetailsModal: React.FC<PackageDetailsModalProps> = ({
  package: pkg,
  onClose,
  onUpdate,
}) => {
  const hasVulnerabilities =
    pkg.vulnerabilities && pkg.vulnerabilities.length > 0;

  // Safely get description as string
  const description =
    pkg.metadata?.description && typeof pkg.metadata.description === "string"
      ? pkg.metadata.description
      : "";

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large">
        <div className="modal-header">
          <div className="package-header-info">
            {pkg.metadata?.iconUrl && (
              <img
                src={pkg.metadata.iconUrl}
                alt=""
                className="package-header-icon"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <div>
              <h2>
                {pkg.name}
                {pkg.metadata?.verified && (
                  <span className="verified-badge" title="Verified owner">
                    ✓
                  </span>
                )}
              </h2>
              {pkg.metadata?.authors && (
                <div className="package-header-authors">
                  by {pkg.metadata.authors.join(", ")}
                </div>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body details-modal-body">
          {/* Description & Package Info Unified Section */}
          <div className="details-section">
            {/* Description */}
            {description && (
              <p className="description-text" style={{ marginBottom: "16px" }}>
                {description}
              </p>
            )}

            {/* Package Metadata */}
            <div className="package-meta-inline">
              {pkg.metadata?.totalDownloads &&
                pkg.metadata.totalDownloads > 0 && (
                  <span className="meta-item">
                    📥 {formatDownloads(pkg.metadata.totalDownloads)}
                  </span>
                )}
              {pkg.metadata?.publishedDate && (
                <span className="meta-item">
                  📅 {new Date(pkg.metadata.publishedDate).toLocaleDateString()}
                </span>
              )}
              {pkg.metadata?.owners && pkg.metadata.owners.length > 0 && (
                <span className="meta-item">
                  👤 {pkg.metadata.owners.join(", ")}
                </span>
              )}
              {pkg.metadata?.licenseUrl ? (
                <a
                  href={pkg.metadata.licenseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="meta-item meta-link"
                >
                  📄 View License
                </a>
              ) : null}
            </div>

            {/* Project URL */}
            {pkg.metadata?.projectUrl && (
              <div className="project-url-inline">
                <a
                  href={pkg.metadata.projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🔗 {pkg.metadata.projectUrl}
                </a>
              </div>
            )}

            {/* Tags */}
            {pkg.metadata?.tags && pkg.metadata.tags.length > 0 && (
              <div className="tag-list-inline">
                {pkg.metadata.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Version Info */}
          <div className="details-section">
            <h3>Version Information</h3>
            <div className="version-info-grid">
              <div className="version-info-item">
                <span className="label">Installed:</span>
                <code className="version-badge">{pkg.currentVersion}</code>
              </div>
              <div className="version-info-item">
                <span className="label">Latest Stable:</span>
                <code className="version-badge">
                  {pkg.latestVersion || "N/A"}
                </code>
                {pkg.updateAvailable && (
                  <button
                    className="update-inline-button"
                    onClick={() => onUpdate(pkg.name, pkg.latestVersion)}
                  >
                    Update
                  </button>
                )}
              </div>
              {pkg.prereleaseVersion && (
                <div className="version-info-item">
                  <span className="label">Latest Pre-release:</span>
                  <code className="version-badge prerelease">
                    {pkg.prereleaseVersion}
                  </code>
                  <button
                    className="update-inline-button prerelease"
                    onClick={() => onUpdate(pkg.name, pkg.prereleaseVersion!)}
                  >
                    Update
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Release Notes */}
          {pkg.metadata?.releaseNotes && (
            <div className="details-section">
              <h3>📝 Release Notes</h3>
              <div className="release-notes-content">
                {pkg.metadata.releaseNotes}
              </div>
            </div>
          )}

          {/* Deprecation Warning */}
          {pkg.metadata?.deprecation && (
            <div className="details-section deprecation-section">
              <h3>⚠️ Deprecation Notice</h3>
              <div className="deprecation-content">
                {pkg.metadata.deprecation.message && (
                  <p>{pkg.metadata.deprecation.message}</p>
                )}
                {pkg.metadata.deprecation.reasons && (
                  <p>
                    <strong>Reasons:</strong>{" "}
                    {pkg.metadata.deprecation.reasons.join(", ")}
                  </p>
                )}
                {pkg.metadata.deprecation.alternatePackage && (
                  <p>
                    <strong>Recommended Alternative:</strong>{" "}
                    <a
                      href={`https://www.nuget.org/packages/${pkg.metadata.deprecation.alternatePackage.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {pkg.metadata.deprecation.alternatePackage.id}
                    </a>
                    {pkg.metadata.deprecation.alternatePackage.range &&
                      ` (${pkg.metadata.deprecation.alternatePackage.range})`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Vulnerabilities */}
          {hasVulnerabilities && (
            <div className="details-section vulnerability-section">
              <h3>🔒 Security Vulnerabilities</h3>
              <div className="vulnerability-list-detailed">
                {pkg.vulnerabilities!.map((vuln, idx) => (
                  <div key={idx} className="vulnerability-card">
                    <div className="vulnerability-card-header">
                      <span
                        className={`severity-badge severity-${vuln.severity}`}
                      >
                        {getSeverityIcon(vuln.severity)}{" "}
                        {getSeverityLabel(vuln.severity)}
                      </span>
                    </div>
                    <div className="vulnerability-card-body">
                      <div className="vuln-detail">
                        <span className="label">Affected Versions:</span>
                        <span>{vuln.versions}</span>
                      </div>
                      <a
                        href={vuln.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="vuln-details-link"
                      >
                        View Advisory →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              <p className="security-recommendation">
                ⚠️ It is recommended to update this package to a version that
                addresses these vulnerabilities.
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <a
            href={`https://www.nuget.org/packages/${pkg.name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="secondary-button"
          >
            View on NuGet.org
          </a>
          <button className="primary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PackageDetailsModal;
