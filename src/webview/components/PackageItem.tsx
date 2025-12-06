import React from 'react';
import { PackageWithLatest } from '../../types';

interface PackageItemProps {
  package: PackageWithLatest;
  onShowDetails: (pkg: PackageWithLatest) => void;
  isSelected?: boolean;
}

/**
 * Get severity icon
 */
function getSeverityIcon(severity: number): string {
  switch (severity) {
    case 0:
      return '⚪'; // Low
    case 1:
      return '🟡'; // Medium
    case 2:
      return '🟠'; // High
    case 3:
      return '🔴'; // Critical
    default:
      return '⚠️';
  }
}

/**
 * Format download count for compact display
 */
function formatDownloads(count?: number): string {
  if (!count) { return ''; }
  if (count >= 1000000000) {
    return `${(count / 1000000000).toFixed(1)}B`;
  }
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

const PackageItem: React.FC<PackageItemProps> = ({ package: pkg, onShowDetails, isSelected }) => {
  const hasVulnerabilities = pkg.vulnerabilities && pkg.vulnerabilities.length > 0;
  const maxSeverity = hasVulnerabilities
    ? Math.max(...pkg.vulnerabilities!.map((v) => v.severity))
    : -1;

  // Safely get description as string
  const description = pkg.metadata?.description && typeof pkg.metadata.description === 'string' 
    ? pkg.metadata.description 
    : '';

  // Get update info
  const hasUpdate = pkg.updateAvailable && pkg.latestVersion;

  return (
    <div 
      className={`search-result-item ${isSelected ? 'selected' : ''}`}
      onClick={() => onShowDetails(pkg)}
    >
      <div className="search-result-icon">
        {pkg.metadata?.iconUrl ? (
          <img
            src={pkg.metadata.iconUrl}
            alt=""
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="default-icon">📦</div>
        )}
      </div>
      <div className="search-result-info">
        <div className="search-result-header">
          <span className="search-result-name">
            {pkg.name}
            {pkg.metadata?.verified && (
              <span className="verified-badge" title="Verified owner">✓</span>
            )}
          </span>
          <span className="search-result-version">{pkg.currentVersion}</span>
        </div>
        {pkg.metadata?.authors && pkg.metadata.authors.length > 0 && (
          <div className="search-result-authors">
            by {pkg.metadata.authors.join(', ')}
          </div>
        )}
        {description && (
          <div className="search-result-description">
            {description.slice(0, 100)}
            {description.length > 100 ? '...' : ''}
          </div>
        )}
        <div className="search-result-stats">
          {pkg.metadata?.totalDownloads ? (
            <span className="downloads">{formatDownloads(pkg.metadata.totalDownloads)} downloads</span>
          ) : null}
          {hasUpdate && (
            <span className={`upgrade-badge ${pkg.updateType || 'update'}`}>
              ⬆ {pkg.latestVersion}
            </span>
          )}
          {hasVulnerabilities && (
            <span className="vulnerability-badge">
              {getSeverityIcon(maxSeverity)} {pkg.vulnerabilities!.length} vulnerabilit{pkg.vulnerabilities!.length === 1 ? 'y' : 'ies'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default PackageItem;
