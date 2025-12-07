import * as vscode from "vscode";
import {
  getLatestVersion,
  getLatestPrereleaseVersion,
  getPackageVersions,
  searchPackages,
  isPrereleaseVersion,
  getVulnerabilities,
  getSeverityLabel,
  getSeverityEmoji,
  compareVersions,
  getUpdateType,
  VulnerabilityInfo,
} from "./nugetApi";
import { updatePackage, addPackage, removePackage } from "./dotnetCli";
import { parseCsproj } from "./csprojParser";

/**
 * Format a NuGet vulnerability version range into a human-readable string
 */
function formatVulnerabilityRange(range: string): string {
  if (!range) {
    return "";
  }
  const trimmed = range.trim();
  const intervalMatch = trimmed.match(
    /^([\[\(])([^,]*),?\s*([^\]\)]*)([\]\)])$/,
  );
  if (!intervalMatch) {
    return trimmed;
  }

  const [, leftBracket, minVer, maxVer, rightBracket] = intervalMatch;
  const min = minVer.trim();
  const max = maxVer.trim();
  const minInclusive = leftBracket === "[";
  const maxInclusive = rightBracket === "]";

  if (min && max && min === max && minInclusive && maxInclusive) {
    return `Exact ${min}`;
  }
  if (min && !max) {
    return `${minInclusive ? ">= " : "> "}${min}`;
  }
  if (!min && max) {
    return `${maxInclusive ? "<= " : "< "}${max}`;
  }
  if (min && max) {
    return `${minInclusive ? ">=" : ">"} ${min} && ${maxInclusive ? "<=" : "<"} ${max}`;
  }
  return trimmed;
}

// Cache for package version info per document
interface PackageVersionInfo {
  packageName: string;
  currentVersion: string;
  latestVersion: string | null;
  latestPrereleaseVersion: string | null;
  vulnerabilities: VulnerabilityInfo[];
  line: number;
  range: vscode.Range;
  isChecking: boolean;
  isUpdating: boolean;
}

const documentPackageCache = new Map<string, PackageVersionInfo[]>();

/**
 * Parse a .csproj document and extract PackageReference information
 */
function parsePackageReferences(
  document: vscode.TextDocument,
): PackageVersionInfo[] {
  const packages: PackageVersionInfo[] = [];
  const text = document.getText();

  // Process line by line for accurate line numbers
  const lines = text.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    // Check if line contains PackageReference
    if (!line.includes("<PackageReference")) {
      continue;
    }

    // Robust parsing: Match the tag first, then extract attributes
    // This handles different attribute orders and single/double quotes
    const tagMatch = /<PackageReference\s+([^>]+?)\/?>/i.exec(line);
    if (!tagMatch) {
      continue;
    }

    const attributes = tagMatch[1];

    // Extract Include and Version using flexible regex
    const includeMatch = /Include\s*=\s*["']([^"']+)["']/i.exec(attributes);
    const versionMatch = /Version\s*=\s*["']([^"']+)["']/i.exec(attributes);

    if (includeMatch && versionMatch) {
      const packageName = includeMatch[1];
      const currentVersion = versionMatch[1];
      const lineEndPosition = line.length;

      packages.push({
        packageName,
        currentVersion,
        latestVersion: null,
        latestPrereleaseVersion: null,
        vulnerabilities: [],
        line: lineIndex,
        range: new vscode.Range(lineIndex, 0, lineIndex, lineEndPosition),
        isChecking: true,
        isUpdating: false,
      });
    }
  }

  return packages;
}

/**
 * Compare versions to check if current is up to date
 */
function isVersionUpToDate(current: string, latest: string): boolean {
  // Handle null/empty cases
  if (!latest) {
    return true;
  }

  // Simple string comparison first
  if (current === latest) {
    return true;
  }

  // Parse versions for numeric comparison
  const currentParts = current
    .replace(/[^\d.]/g, "")
    .split(".")
    .map(Number);
  const latestParts = latest
    .replace(/[^\d.]/g, "")
    .split(".")
    .map(Number);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;

    if (c < l) {
      return false;
    }
    if (c > l) {
      return true;
    }
  }

  return true;
}

/**
 * CodeLens provider for .csproj files
 * Shows clickable "Update to X.X.X" links on PackageReference lines
 */
class CsprojCodeLensProviderImpl implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!document.fileName.endsWith(".csproj")) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    const documentUri = document.uri.toString();

    // Add a CodeLens at the top of the file to choose/switch project
    const firstLine = new vscode.Range(0, 0, 0, 0);
    codeLenses.push(
      new vscode.CodeLens(firstLine, {
        title: "➕ Add Package",
        command: "yet-another-nuget-package-manager.searchAndAddPackage",
        arguments: [document.uri.fsPath],
        tooltip: "Search and add a NuGet package",
      }),
    );

    // Get packages from cache or parse fresh
    let packages = documentPackageCache.get(documentUri);
    if (!packages) {
      packages = parsePackageReferences(document);
      documentPackageCache.set(documentUri, packages);

      // Fetch versions asynchronously
      this.fetchVersionsAsync(document, packages);
    }

    // Check if there are any packages with updates available
    const packagesWithUpdates = packages.filter(
      (pkg) =>
        pkg.latestVersion &&
        !isVersionUpToDate(pkg.currentVersion, pkg.latestVersion),
    );

    if (packagesWithUpdates.length > 0) {
      codeLenses.push(
        new vscode.CodeLens(firstLine, {
          title: `⬆️ Upgrade All (${packagesWithUpdates.length})`,
          command: "yet-another-nuget-package-manager.upgradeAllPackages",
          arguments: [document.uri.fsPath],
          tooltip: `Upgrade all ${packagesWithUpdates.length} packages with available updates`,
        }),
      );
    }

    for (const pkg of packages) {
      const range = new vscode.Range(pkg.line, 0, pkg.line, 0);

      // Check for vulnerabilities first
      if (pkg.vulnerabilities.length > 0) {
        const highestSeverity = Math.max(
          ...pkg.vulnerabilities.map((v) => v.severity),
        );
        const emoji = getSeverityEmoji(highestSeverity);
        const label = getSeverityLabel(highestSeverity);
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `${emoji} ${pkg.vulnerabilities.length} ${pkg.vulnerabilities.length > 1 ? "Vulnerabilities" : "Vulnerability"} (${label})`,
            command: "yet-another-nuget-package-manager.showVulnerabilities",
            arguments: [pkg.packageName, pkg.vulnerabilities],
            tooltip: `${pkg.packageName} has known security vulnerabilities. Click for details.`,
          }),
        );
      }

      // Check if update is available
      const hasStableUpdate =
        pkg.latestVersion &&
        !isVersionUpToDate(pkg.currentVersion, pkg.latestVersion);

      // Only show pre-release if it's NEWER than the latest stable version
      // Compare pre-release version to latest stable - if pre-release > stable, show it
      const hasPrereleaseUpdate =
        pkg.latestPrereleaseVersion &&
        pkg.latestVersion &&
        pkg.latestPrereleaseVersion !== pkg.currentVersion &&
        compareVersions(pkg.latestPrereleaseVersion, pkg.latestVersion) > 0;

      if (hasStableUpdate && !pkg.isUpdating) {
        // Update to stable version CodeLens
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `⬆️ Update to ${pkg.latestVersion}`,
            command: "yet-another-nuget-package-manager.updatePackageInline",
            arguments: [
              document.uri.fsPath,
              pkg.packageName,
              pkg.latestVersion,
            ],
            tooltip: `Update ${pkg.packageName} from ${pkg.currentVersion} to ${pkg.latestVersion}`,
          }),
        );

        // Show pre-release update option only if it's newer than stable
        if (hasPrereleaseUpdate) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `🧪 Pre-release ${pkg.latestPrereleaseVersion}`,
              command: "yet-another-nuget-package-manager.updatePackageInline",
              arguments: [
                document.uri.fsPath,
                pkg.packageName,
                pkg.latestPrereleaseVersion,
              ],
              tooltip: `Update ${pkg.packageName} to pre-release version ${pkg.latestPrereleaseVersion}`,
            }),
          );
        }

        // Select version CodeLens
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `📋 Select version`,
            command: "yet-another-nuget-package-manager.selectPackageVersion",
            arguments: [
              document.uri.fsPath,
              pkg.packageName,
              pkg.currentVersion,
            ],
            tooltip: `Choose a specific version for ${pkg.packageName}`,
          }),
        );

        // View on NuGet.org CodeLens
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `🔗 NuGet`,
            command: "yet-another-nuget-package-manager.openNugetPage",
            arguments: [pkg.packageName],
            tooltip: `View ${pkg.packageName} on NuGet.org`,
          }),
        );

        // Remove package CodeLens
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `🗑️ Remove`,
            command: "yet-another-nuget-package-manager.removePackageInline",
            arguments: [document.uri.fsPath, pkg.packageName],
            tooltip: `Remove ${pkg.packageName} from project`,
          }),
        );
      } else if (
        pkg.latestVersion &&
        isVersionUpToDate(pkg.currentVersion, pkg.latestVersion) &&
        !pkg.isUpdating
      ) {
        // Show "up to date" indicator for packages that are current
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `✅ Latest`,
            command: "",
            tooltip: `${pkg.packageName} is up to date`,
          }),
        );

        // Show pre-release update option only if it's newer than stable
        if (hasPrereleaseUpdate) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `🧪 Pre-release ${pkg.latestPrereleaseVersion}`,
              command: "yet-another-nuget-package-manager.updatePackageInline",
              arguments: [
                document.uri.fsPath,
                pkg.packageName,
                pkg.latestPrereleaseVersion,
              ],
              tooltip: `Update ${pkg.packageName} to pre-release version ${pkg.latestPrereleaseVersion}`,
            }),
          );
        }

        // Select version CodeLens (even for up-to-date packages, allow downgrade)
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `📋 Select version`,
            command: "yet-another-nuget-package-manager.selectPackageVersion",
            arguments: [
              document.uri.fsPath,
              pkg.packageName,
              pkg.currentVersion,
            ],
            tooltip: `Choose a specific version for ${pkg.packageName}`,
          }),
        );

        // View on NuGet.org CodeLens
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `🔗 NuGet`,
            command: "yet-another-nuget-package-manager.openNugetPage",
            arguments: [pkg.packageName],
            tooltip: `View ${pkg.packageName} on NuGet.org`,
          }),
        );

        // Remove package CodeLens
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `🗑️ Remove`,
            command: "yet-another-nuget-package-manager.removePackageInline",
            arguments: [document.uri.fsPath, pkg.packageName],
            tooltip: `Remove ${pkg.packageName} from project`,
          }),
        );
      } else if (pkg.isChecking) {
        // Show loading indicator while checking
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: "⏳ Checking...",
            command: "",
            tooltip: `Checking for updates to ${pkg.packageName}`,
          }),
        );
      } else if (pkg.isUpdating) {
        // Show updating indicator
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: "⏳ Updating...",
            command: "",
            tooltip: `Updating ${pkg.packageName}`,
          }),
        );
      }
    }

    return codeLenses;
  }

  private async fetchVersionsAsync(
    document: vscode.TextDocument,
    packages: PackageVersionInfo[],
  ): Promise<void> {
    const promises = packages.map(async (pkg) => {
      try {
        const [latestVersion, latestPrereleaseVersion, vulnerabilities] =
          await Promise.all([
            getLatestVersion(pkg.packageName),
            getLatestPrereleaseVersion(pkg.packageName),
            getVulnerabilities(pkg.packageName, pkg.currentVersion),
          ]);
        pkg.latestVersion = latestVersion;
        pkg.latestPrereleaseVersion = latestPrereleaseVersion;
        pkg.vulnerabilities = vulnerabilities;
      } catch {
        pkg.latestVersion = null;
        pkg.latestPrereleaseVersion = null;
        pkg.vulnerabilities = [];
      }
      pkg.isChecking = false;
    });

    await Promise.all(promises);

    // Update cache and refresh CodeLenses
    documentPackageCache.set(document.uri.toString(), packages);
    this._onDidChangeCodeLenses.fire();
  }
}

/**
 * Handle inline package update command
 */
async function handleUpdatePackageInline(
  projectPath: string,
  packageName: string,
  version: string,
): Promise<void> {
  // Set updating flag and refresh CodeLenses
  const documentUri = vscode.Uri.file(projectPath).toString();
  const packages = documentPackageCache.get(documentUri);
  if (packages) {
    const pkg = packages.find((p) => p.packageName === packageName);
    if (pkg) {
      pkg.isUpdating = true;
      if (codeLensProvider) {
        codeLensProvider.refresh();
      }
    }
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Updating ${packageName} to ${version}...`,
        cancellable: false,
      },
      async () => {
        const result = await updatePackage({
          projectPath,
          packageName,
          version,
        });

        if (result.success) {
          vscode.window.showInformationMessage(
            `Successfully updated ${packageName} to ${version}`,
          );

          // Clear cache for this document and refresh CodeLenses
          clearCacheForProject(projectPath);
          if (codeLensProvider) {
            codeLensProvider.refresh();
          }
        } else {
          vscode.window.showErrorMessage(
            `Failed to update ${packageName}: ${result.stderr || "Unknown error"}`,
          );
        }
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error updating package: ${errorMessage}`);
  } finally {
    // Reset updating flag and refresh CodeLenses
    if (packages) {
      const pkg = packages.find((p) => p.packageName === packageName);
      if (pkg) {
        pkg.isUpdating = false;
        if (codeLensProvider) {
          codeLensProvider.refresh();
        }
      }
    }
  }
}

/**
 * Open NuGet.org page for a package
 */
function handleOpenNugetPage(packageName: string): void {
  const url = `https://www.nuget.org/packages/${encodeURIComponent(packageName)}`;
  vscode.env.openExternal(vscode.Uri.parse(url));
}

/**
 * Show vulnerability details for a package
 */
async function handleShowVulnerabilities(
  packageName: string,
  vulnerabilities: VulnerabilityInfo[],
): Promise<void> {
  const items: vscode.QuickPickItem[] = vulnerabilities.map((vuln) => ({
    label: `${getSeverityEmoji(vuln.severity)} ${getSeverityLabel(vuln.severity)}`,
    description: formatVulnerabilityRange(vuln.versions),
    detail: vuln.url,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: `Vulnerabilities in ${packageName}`,
    placeHolder: "Select a vulnerability to view details",
  });

  if (selected && selected.detail) {
    vscode.env.openExternal(vscode.Uri.parse(selected.detail));
  }
}

async function handleRemovePackageInline(
  projectPath: string,
  packageName: string,
): Promise<void> {
  const confirmed = await vscode.window.showWarningMessage(
    `Remove ${packageName} from project?`,
    { modal: true },
    "Remove",
  );

  if (confirmed !== "Remove") {
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Removing ${packageName}...`,
        cancellable: false,
      },
      async () => {
        const result = await removePackage({
          projectPath,
          packageName,
        });

        if (result.success) {
          vscode.window.showInformationMessage(
            `Successfully removed ${packageName}`,
          );
          clearCacheForProject(projectPath);
          if (codeLensProvider) {
            codeLensProvider.refresh();
          }
        } else {
          vscode.window.showErrorMessage(
            `Failed to remove ${packageName}: ${result.stderr || "Unknown error"}`,
          );
        }
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error removing package: ${errorMessage}`);
  }
}

/**
 * Handle selecting a specific package version
 */
async function handleSelectPackageVersion(
  projectPath: string,
  packageName: string,
  currentVersion: string,
): Promise<void> {
  try {
    // Show loading quick pick
    const versions = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Loading versions for ${packageName}...`,
        cancellable: false,
      },
      async () => {
        return await getPackageVersions(packageName);
      },
    );

    if (versions.length === 0) {
      vscode.window.showWarningMessage(`No versions found for ${packageName}`);
      return;
    }

    // Create quick pick items with prerelease indicators
    const items: vscode.QuickPickItem[] = versions
      .slice(0, 50)
      .map((version) => ({
        label: version,
        description:
          version === currentVersion
            ? "(current)"
            : isPrereleaseVersion(version)
              ? "(prerelease)"
              : "",
        picked: version === currentVersion,
      }));

    const selected = await vscode.window.showQuickPick(items, {
      title: `Select version for ${packageName}`,
      placeHolder: `Current version: ${currentVersion}`,
    });

    if (selected && selected.label !== currentVersion) {
      await handleUpdatePackageInline(projectPath, packageName, selected.label);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error loading versions: ${errorMessage}`);
  }
}

/**
 * Clear cache for a specific project path
 */
function clearCacheForProject(projectPath: string): void {
  const uri = vscode.Uri.file(projectPath).toString();
  documentPackageCache.delete(uri);
}

/**
 * Handle searching and adding a NuGet package
 */
async function handleSearchAndAddPackage(projectPath: string): Promise<void> {
  // Create a quick pick with search functionality
  const quickPick = vscode.window.createQuickPick();
  quickPick.placeholder = "Search for a NuGet package...";
  quickPick.title = "Add NuGet Package";
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;

  let searchTimeout: NodeJS.Timeout | undefined;
  let currentSearch = "";

  quickPick.onDidChangeValue(async (value) => {
    // Debounce search
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (value.length < 2) {
      quickPick.items = [];
      return;
    }

    currentSearch = value;
    quickPick.busy = true;

    searchTimeout = setTimeout(async () => {
      try {
        const results = await searchPackages(value, 20, true);

        // Only update if this is still the current search
        if (value === currentSearch) {
          quickPick.items = results.map((pkg) => ({
            label: pkg.id,
            description: pkg.version,
            detail: pkg.description
              ? pkg.description.substring(0, 100) +
                (pkg.description.length > 100 ? "..." : "")
              : "",
            alwaysShow: true,
          }));
          quickPick.busy = false;
        }
      } catch (error) {
        quickPick.busy = false;
        console.error("Search error:", error);
      }
    }, 300);
  });

  quickPick.onDidAccept(async () => {
    const selected = quickPick.selectedItems[0];
    if (selected) {
      quickPick.hide();

      // Ask for version
      const versions = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Loading versions for ${selected.label}...`,
          cancellable: false,
        },
        async () => {
          return await getPackageVersions(selected.label);
        },
      );

      if (versions.length === 0) {
        // Just add with latest
        await addPackageToProject(projectPath, selected.label);
        return;
      }

      // Show version picker
      const versionItems: vscode.QuickPickItem[] = [
        {
          label: "Latest stable",
          description:
            versions.find((v) => !isPrereleaseVersion(v)) || versions[0],
        },
        ...versions.slice(0, 30).map((v) => ({
          label: v,
          description: isPrereleaseVersion(v) ? "(prerelease)" : "",
        })),
      ];

      const selectedVersion = await vscode.window.showQuickPick(versionItems, {
        title: `Select version for ${selected.label}`,
        placeHolder: 'Choose a version or select "Latest stable"',
      });

      if (selectedVersion) {
        const version =
          selectedVersion.label === "Latest stable"
            ? selectedVersion.description
            : selectedVersion.label;
        await addPackageToProject(projectPath, selected.label, version);
      }
    }
  });

  quickPick.onDidHide(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    quickPick.dispose();
  });

  quickPick.show();
}

/**
 * Add a package to the project
 */
async function addPackageToProject(
  projectPath: string,
  packageName: string,
  version?: string,
): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Adding ${packageName}${version ? ` v${version}` : ""}...`,
        cancellable: false,
      },
      async () => {
        const result = await addPackage({
          projectPath,
          packageName,
          version,
        });

        if (result.success) {
          vscode.window.showInformationMessage(
            `Successfully added ${packageName}${version ? ` v${version}` : ""}`,
          );

          // Clear cache for this document and refresh CodeLenses
          clearCacheForProject(projectPath);
          if (codeLensProvider) {
            codeLensProvider.refresh();
          }
        } else {
          vscode.window.showErrorMessage(
            `Failed to add ${packageName}: ${result.stderr || "Unknown error"}`,
          );
        }
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error adding package: ${errorMessage}`);
  }
}

/**
 * Handle upgrade all packages command
 */
async function handleUpgradeAllPackages(projectPath: string): Promise<void> {
  // Show quick pick with upgrade options
  const options: vscode.QuickPickItem[] = [
    {
      label: "⬆️ Upgrade All (Respect Pre-release)",
      description:
        "Upgrade all packages, keeping pre-release packages on pre-release track",
      detail:
        "Stable packages stay on stable versions, pre-release packages can upgrade to newer pre-releases",
    },
    {
      label: "🟡 Minor Updates Only",
      description: "Only apply minor and patch updates",
      detail: "Skip major version updates that may contain breaking changes",
    },
    {
      label: "🔴 Include Major Updates",
      description: "Upgrade all packages including major version changes",
      detail: "May include breaking changes - review carefully",
    },
  ];

  const selected = await vscode.window.showQuickPick(options, {
    title: "Upgrade All Packages",
    placeHolder: "Select upgrade mode",
  });

  if (!selected) {
    return;
  }

  // Parse the csproj to get packages
  const parseResult = await parseCsproj(projectPath);
  if (parseResult.error || parseResult.packages.length === 0) {
    vscode.window.showWarningMessage("No packages found to upgrade");
    return;
  }

  // Determine which packages to update based on mode
  const mode = selected.label.includes("Minor")
    ? "minor"
    : selected.label.includes("Major")
      ? "major"
      : "all";

  // Get cached package info
  const documentUri = vscode.Uri.file(projectPath).toString();
  const cachedPackages = documentPackageCache.get(documentUri) || [];

  // Filter packages that need updating
  const packagesToUpdate: {
    name: string;
    currentVersion: string;
    targetVersion: string;
  }[] = [];

  for (const pkg of parseResult.packages) {
    const cachedPkg = cachedPackages.find((p) => p.packageName === pkg.name);
    if (!cachedPkg || !cachedPkg.latestVersion) {
      continue;
    }

    const hasUpdate = !isVersionUpToDate(
      cachedPkg.currentVersion,
      cachedPkg.latestVersion,
    );
    if (!hasUpdate) {
      continue;
    }

    const currentIsPrerelease = isPrereleaseVersion(cachedPkg.currentVersion);
    const updateType = getUpdateType(
      cachedPkg.currentVersion,
      cachedPkg.latestVersion,
    );

    if (mode === "minor") {
      // Only minor and patch updates
      if (updateType !== "minor" && updateType !== "patch") {
        continue;
      }
    }

    if (mode === "all" && !currentIsPrerelease) {
      // For stable packages in 'all' mode, don't upgrade to prerelease
      if (isPrereleaseVersion(cachedPkg.latestVersion)) {
        continue;
      }
    }

    // Determine target version
    let targetVersion = cachedPkg.latestVersion;
    if (
      mode === "all" &&
      currentIsPrerelease &&
      cachedPkg.latestPrereleaseVersion
    ) {
      // Prefer prerelease for current prerelease packages
      targetVersion = cachedPkg.latestPrereleaseVersion;
    }

    packagesToUpdate.push({
      name: cachedPkg.packageName,
      currentVersion: cachedPkg.currentVersion,
      targetVersion,
    });
  }

  if (packagesToUpdate.length === 0) {
    vscode.window.showInformationMessage(
      "No packages to upgrade with the selected criteria.",
    );
    return;
  }

  // Perform upgrades
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Upgrading ${packagesToUpdate.length} package(s)...`,
      cancellable: false,
    },
    async (progress) => {
      let successCount = 0;
      let failCount = 0;
      const failedPackages: string[] = [];

      for (let i = 0; i < packagesToUpdate.length; i++) {
        const pkg = packagesToUpdate[i];
        progress.report({
          message: `Upgrading ${pkg.name} (${i + 1}/${packagesToUpdate.length})...`,
          increment: 100 / packagesToUpdate.length,
        });

        const result = await updatePackage({
          projectPath,
          packageName: pkg.name,
          version: pkg.targetVersion,
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
          failedPackages.push(pkg.name);
        }
      }

      // Clear cache and refresh
      clearCacheForProject(projectPath);
      if (codeLensProvider) {
        codeLensProvider.refresh();
      }

      if (failCount === 0) {
        vscode.window.showInformationMessage(
          `Successfully upgraded ${successCount} package(s)`,
        );
      } else {
        vscode.window.showWarningMessage(
          `Upgraded ${successCount} package(s), ${failCount} failed: ${failedPackages.join(", ")}`,
        );
      }
    },
  );
}

// Store the CodeLens provider instance for access
let codeLensProvider: CsprojCodeLensProviderImpl | null = null;

/**
 * Register all .csproj CodeLens features
 */
export function registerCsprojFeatures(context: vscode.ExtensionContext): void {
  // Register CodeLens provider
  codeLensProvider = new CsprojCodeLensProviderImpl(); // Register the provider
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file", language: "xml", pattern: "**/*.csproj" },
      codeLensProvider,
    ),
  );

  // Clean up cache when documents are closed to prevent memory leaks
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      documentPackageCache.delete(doc.uri.toString());
    }),
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yet-another-nuget-package-manager.updatePackageInline",
      handleUpdatePackageInline,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yet-another-nuget-package-manager.openNugetPage",
      handleOpenNugetPage,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yet-another-nuget-package-manager.selectPackageVersion",
      handleSelectPackageVersion,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yet-another-nuget-package-manager.searchAndAddPackage",
      handleSearchAndAddPackage,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yet-another-nuget-package-manager.showVulnerabilities",
      handleShowVulnerabilities,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yet-another-nuget-package-manager.upgradeAllPackages",
      handleUpgradeAllPackages,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yet-another-nuget-package-manager.removePackageInline",
      handleRemovePackageInline,
    ),
  );

  // Refresh CodeLenses when a .csproj file is opened
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.fileName.endsWith(".csproj")) {
        if (codeLensProvider) {
          codeLensProvider.refresh();
        }
      }
    }),
  );

  // Refresh CodeLenses when a .csproj document is saved
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.fileName.endsWith(".csproj")) {
        // Clear cache for this document
        documentPackageCache.delete(document.uri.toString());

        // Refresh CodeLenses
        if (codeLensProvider) {
          codeLensProvider.refresh();
        }
      }
    }),
  );

  // Refresh CodeLenses when document content changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.fileName.endsWith(".csproj")) {
        // Clear cache for this document since content changed
        documentPackageCache.delete(event.document.uri.toString());

        // Refresh CodeLenses
        if (codeLensProvider) {
          codeLensProvider.refresh();
        }
      }
    }),
  );
}

/**
 * Clear all caches (useful for manual refresh)
 */
export function clearAllCaches(): void {
  documentPackageCache.clear();
  if (codeLensProvider) {
    codeLensProvider.refresh();
  }
}
