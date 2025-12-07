import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  PackageWithLatest,
  ExtensionMessage,
  WebviewMessage,
  ProjectInfo,
  NuGetSearchResult,
} from "../types";
import PackageList from "./components/PackageList";
import PackageDetailsPanel from "./components/PackageDetailsPanel";
import "./components/styles.css";

interface VSCodeAPI {
  postMessage(message: unknown): void;
  getState?(): unknown;
  setState?(state: unknown): void;
}

declare global {
  function acquireVsCodeApi(): VSCodeAPI;
}

// Acquire the VS Code API once, outside the component to avoid issues with React StrictMode
const vscodeApi = acquireVsCodeApi();

type ViewMode = "installed" | "browse";
type UpgradeMode = "all" | "minor" | "major";

/**
 * Format download count for compact display (lists)
 */
function formatDownloadsShort(count?: number): string {
  if (!count) return "";
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

/**
 * Format download count for full display (details panel)
 */
function formatDownloadsFull(count?: number): string {
  if (!count) return "";
  return count.toLocaleString();
}

const App: React.FC = () => {
  const [packages, setPackages] = useState<PackageWithLatest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("installed");
  const [projectPath, setProjectPath] = useState<string>("");
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [searchResults, setSearchResults] = useState<NuGetSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Package details are now shown in the right panel instead of a modal
  const [searchQuery, setSearchQuery] = useState("");
  const [includePrerelease, setIncludePrerelease] = useState(false);
  const [selectedSearchPackage, setSelectedSearchPackage] =
    useState<NuGetSearchResult | null>(null);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [showUpgradeMenu, setShowUpgradeMenu] = useState(false);
  const [selectedInstalledPackage, setSelectedInstalledPackage] =
    useState<PackageWithLatest | null>(null);
  const [installedPackageVersions, setInstalledPackageVersions] = useState<
    { version: string; downloads: number }[]
  >([]);
  const [installedPackageSearchData, setInstalledPackageSearchData] =
    useState<NuGetSearchResult | null>(null);
  const [selectedInstalledVersion, setSelectedInstalledVersion] = useState("");
  const [installedFilter, setInstalledFilter] = useState("");
  const [operationInProgress, setOperationInProgress] = useState<string | null>(
    null
  ); // packageName being operated on
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedInstalledPackageRef = useRef<PackageWithLatest | null>(null);

  // Get set of installed package names for quick lookup
  const installedPackageNames = new Set(
    packages.map((p) => p.name.toLowerCase())
  );

  // Keep ref in sync with state
  useEffect(() => {
    selectedInstalledPackageRef.current = selectedInstalledPackage;
  }, [selectedInstalledPackage]);

  // Handle messages from the extension
  const handleExtensionMessage = useCallback(
    (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case "packageListUpdate":
          setPackages(message.data || []);
          setLoading(false);
          setOperationInProgress(null);
          setError(null);
          if (message.projectPath) {
            setProjectPath(message.projectPath);
          }
          if (message.projects) {
            setProjects(message.projects);
          }
          break;

        case "loading":
          setLoading(true);
          setError(null);
          break;

        case "error":
          setError(message.message);
          setLoading(false);
          setOperationInProgress(null);
          break;

        case "operationComplete":
          if (message.success) {
            if (message.packages) {
              setPackages(message.packages);
            }
            setError(null);
          } else {
            setError(message.message || "Operation failed");
          }
          setLoading(false);
          setOperationInProgress(null);
          break;

        case "searchResults":
          setSearchResults(message.results);
          setIsSearching(false);
          break;

        case "packageVersions":
          if (
            message.packageName === selectedInstalledPackageRef.current?.name
          ) {
            setInstalledPackageVersions(message.versions || []);
            if (message.searchData) {
              setInstalledPackageSearchData(message.searchData);
            }
          }
          break;

        default:
          console.warn("Unknown message type:", message.type);
      }
    },
    []
  );

  // Set up message listener
  useEffect(() => {
    window.addEventListener("message", handleExtensionMessage as EventListener);
    return () => {
      window.removeEventListener(
        "message",
        handleExtensionMessage as EventListener
      );
    };
  }, [handleExtensionMessage]);

  // Request initial package list on mount
  useEffect(() => {
    vscodeApi.postMessage({ command: "refresh" } as WebviewMessage);
  }, []);

  // Focus on search input when switching to browse mode
  useEffect(() => {
    if (viewMode === "browse" && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [viewMode]);

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      setSelectedSearchPackage(null);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (value.trim().length >= 2) {
        setIsSearching(true);
        searchTimeoutRef.current = setTimeout(() => {
          vscodeApi.postMessage({
            command: "searchPackages",
            query: value.trim(),
            includePrerelease,
          } as WebviewMessage);
        }, 300);
      } else {
        setSearchResults([]);
      }
    },
    [includePrerelease]
  );

  // Re-search when prerelease toggle changes
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      vscodeApi.postMessage({
        command: "searchPackages",
        query: searchQuery.trim(),
        includePrerelease,
      } as WebviewMessage);
    }
  }, [includePrerelease]);

  const handleSelectSearchPackage = (pkg: NuGetSearchResult) => {
    setSelectedSearchPackage(pkg);
    setSelectedVersion(pkg.version);
  };

  const handleSelectInstalledPackage = (pkg: PackageWithLatest) => {
    setSelectedInstalledPackage(pkg);
    setSelectedInstalledVersion(pkg.currentVersion);
    setInstalledPackageVersions([]);
    setInstalledPackageSearchData(null);
    // Request versions for this package
    vscodeApi.postMessage({
      command: "getPackageVersions",
      packageName: pkg.name,
    } as WebviewMessage);
  };

  const handleAddPackage = (packageName: string, version?: string) => {
    if (operationInProgress) return; // Prevent double-click
    setOperationInProgress(packageName);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedSearchPackage(null);
    vscodeApi.postMessage({
      command: "addPackage",
      packageName,
      version,
    } as WebviewMessage);
    // Switch back to installed view
    setViewMode("installed");
  };

  const handleRemovePackage = (packageName: string) => {
    if (operationInProgress) return;
    // Note: confirm() doesn't work in VS Code webviews, so we proceed directly
    // A custom confirmation modal could be implemented for better UX
    setOperationInProgress(packageName);
    vscodeApi.postMessage({
      command: "removePackage",
      packageName,
    } as WebviewMessage);
  };

  const handleUpdatePackage = (packageName: string, version: string) => {
    if (operationInProgress) return;
    setOperationInProgress(packageName);
    vscodeApi.postMessage({
      command: "updatePackage",
      packageName,
      version,
    } as WebviewMessage);
  };

  const handleUpgradeAll = (mode: UpgradeMode) => {
    setShowUpgradeMenu(false);
    vscodeApi.postMessage({
      command: "upgradeAllPackages",
      mode,
    });
  };

  const handleRefresh = () => {
    vscodeApi.postMessage({ command: "refresh" } as WebviewMessage);
  };

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPath = e.target.value;
    setProjectPath(newPath);
    vscodeApi.postMessage({
      command: "selectProject",
      projectPath: newPath,
    } as WebviewMessage);
  };

  // Package details are now displayed inline in the right panel

  const getProjectName = () => {
    if (!projectPath) return "Project";
    const parts = projectPath.split(/[\\/]/);
    return parts[parts.length - 1]?.replace(".csproj", "") || "Project";
  };

  // Count packages with updates and vulnerabilities
  const updatesAvailable = packages.filter((p) => p.updateAvailable).length;
  const vulnerablePackages = packages.filter(
    (p) => p.vulnerabilities && p.vulnerabilities.length > 0
  ).length;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>NuGet Package Manager</h1>
          {projects.length > 1 ? (
            <select
              className="project-selector"
              value={projectPath}
              onChange={handleProjectChange}
            >
              {projects.map((project) => (
                <option key={project.path} value={project.path}>
                  {project.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="project-path">{getProjectName()}</p>
          )}
        </div>
        <div className="header-actions">
          {vulnerablePackages > 0 && (
            <span className="vuln-count">
              {vulnerablePackages} package{vulnerablePackages !== 1 ? "s" : ""}{" "}
              with vulnerabilities
            </span>
          )}
          <button
            className="refresh-button"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? "🔄️ Refreshing..." : "🔄️ Refresh"}
          </button>
        </div>
      </header>

      {/* View Mode Tabs */}
      <div className="view-tabs">
        <button
          className={`tab-button ${viewMode === "installed" ? "active" : ""}`}
          onClick={() => setViewMode("installed")}
        >
          📦 Installed ({packages.length})
        </button>
        <button
          className={`tab-button ${viewMode === "browse" ? "active" : ""}`}
          onClick={() => setViewMode("browse")}
        >
          🔍 Browse
        </button>

        {/* Upgrade All Button */}
        {viewMode === "installed" && updatesAvailable > 0 && (
          <div className="upgrade-all-container">
            <button
              className="upgrade-all-button"
              onClick={() => setShowUpgradeMenu(!showUpgradeMenu)}
            >
              ⬆️ Upgrade All ({updatesAvailable})
            </button>
            {showUpgradeMenu && (
              <div className="upgrade-menu">
                <button onClick={() => handleUpgradeAll("all")}>
                  ⬆️ Upgrade All (Respect Pre-release)
                </button>
                <button onClick={() => handleUpgradeAll("minor")}>
                  🟡 Minor Updates Only
                </button>
                <button onClick={() => handleUpgradeAll("major")}>
                  🔴 Include Major Updates
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <div className="error-content">
            <strong>Error</strong>
            <p>{error}</p>
          </div>
          <button className="error-close" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {loading && packages.length === 0 && viewMode === "installed" && (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading packages...</p>
        </div>
      )}

      {/* Installed Packages View */}
      {viewMode === "installed" && (
        <>
          {!loading && packages.length === 0 && !error && (
            <div className="empty-state">
              <p>No packages found in this project.</p>
              <button
                className="primary-button"
                onClick={() => setViewMode("browse")}
              >
                + Add Package
              </button>
            </div>
          )}

          {packages.length > 0 && (
            <div className="split-panel-container">
              {/* Left Panel - Package List */}
              <div className="left-panel">
                <div className="installed-search">
                  <input
                    type="text"
                    value={installedFilter}
                    onChange={(e) => setInstalledFilter(e.target.value)}
                    placeholder="Filter installed packages..."
                    className="filter-input"
                  />
                  {installedFilter && (
                    <button
                      className="clear-filter-button"
                      onClick={() => setInstalledFilter("")}
                      title="Clear filter"
                    >
                      ×
                    </button>
                  )}
                </div>
                <PackageList
                  packages={packages}
                  onShowDetails={handleSelectInstalledPackage}
                  filterText={installedFilter}
                  selectedPackage={selectedInstalledPackage}
                />
              </div>

              {/* Right Panel - Package Details */}
              <div className="right-panel">
                {selectedInstalledPackage ? (
                  <PackageDetailsPanel
                    installedPackage={selectedInstalledPackage}
                    searchPackage={installedPackageSearchData}
                    selectedVersion={selectedInstalledVersion}
                    onVersionChange={setSelectedInstalledVersion}
                    availableVersions={installedPackageVersions}
                    onUpdate={handleUpdatePackage}
                    onRemove={handleRemovePackage}
                    operationInProgress={operationInProgress}
                    formatDownloadsShort={formatDownloadsShort}
                    formatDownloadsFull={formatDownloadsFull}
                  />
                ) : (
                  <div className="details-panel-placeholder">
                    <div className="placeholder-icon">📦</div>
                    <p>Select a package to view details</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Browse/Add Packages View */}
      {viewMode === "browse" && (
        <div className="split-panel-container">
          {/* Left Panel - Search & Results */}
          <div className="left-panel">
            <div className="search-container">
              <div className="search-input-wrapper">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search for packages..."
                  className="search-input"
                />
                {isSearching && <div className="search-spinner" />}
              </div>
              <div className="prerelease-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={includePrerelease}
                    onChange={(e) => setIncludePrerelease(e.target.checked)}
                  />
                  Include Pre-Release
                </label>
              </div>
            </div>

            <div className="search-results">
              {searchQuery.trim().length >= 2 &&
                !isSearching &&
                searchResults.length === 0 && (
                  <div className="no-results">
                    No packages found for "{searchQuery}"
                  </div>
                )}
              {searchQuery.trim().length < 2 && (
                <div className="search-hint">
                  Type at least 2 characters to search for packages
                </div>
              )}
              {searchResults.map((pkg) => {
                const isPackageInstalled = installedPackageNames.has(
                  pkg.id.toLowerCase()
                );
                return (
                  <div
                    key={pkg.id}
                    className={`search-result-item ${
                      selectedSearchPackage?.id === pkg.id ? "selected" : ""
                    }`}
                    onClick={() => handleSelectSearchPackage(pkg)}
                  >
                    <div className="search-result-icon">
                      {pkg.iconUrl ? (
                        <img
                          src={pkg.iconUrl}
                          alt=""
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <div className="default-icon">📦</div>
                      )}
                    </div>
                    <div className="search-result-info">
                      <div className="search-result-header">
                        <span className="search-result-name">
                          {pkg.id}
                          {pkg.verified && (
                            <span
                              className="verified-badge"
                              title="Verified owner"
                            >
                              ✓
                            </span>
                          )}
                          {isPackageInstalled && (
                            <span
                              className="installed-indicator"
                              title="Already installed"
                            >
                              ✓ Installed
                            </span>
                          )}
                        </span>
                        <span className="search-result-version">
                          {pkg.version}
                        </span>
                      </div>
                      <div className="search-result-authors">
                        by {pkg.authors.join(", ") || "Unknown"}
                      </div>
                      <div className="search-result-description">
                        {pkg.description?.slice(0, 100)}
                        {pkg.description && pkg.description.length > 100
                          ? "..."
                          : ""}
                      </div>
                      <div className="search-result-stats">
                        <span className="downloads">
                          {formatDownloadsShort(pkg.totalDownloads)} downloads
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel - Package Details */}
          <div className="right-panel">
            {selectedSearchPackage ? (
              <PackageDetailsPanel
                searchPackage={selectedSearchPackage}
                selectedVersion={selectedVersion}
                onVersionChange={setSelectedVersion}
                onAdd={handleAddPackage}
                operationInProgress={operationInProgress}
                isAlreadyInstalled={installedPackageNames.has(
                  selectedSearchPackage.id.toLowerCase()
                )}
                installedVersion={
                  packages.find(
                    (p) =>
                      p.name.toLowerCase() ===
                      selectedSearchPackage.id.toLowerCase()
                  )?.currentVersion
                }
                formatDownloadsShort={formatDownloadsShort}
                formatDownloadsFull={formatDownloadsFull}
              />
            ) : (
              <div className="details-panel-placeholder">
                <div className="placeholder-icon">🔍</div>
                <p>Select a package to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
