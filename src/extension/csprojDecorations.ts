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
  getPackageMetadata,
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
  if (!latest) {
    return true;
  }

  if (current === latest) {
    return true;
  }

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
    const text = document.getText();
    const lines = text.split("\n");

    // Find the best place for "Add Package" - the ItemGroup containing PackageReferences
    let addPackageLine = 0;
    let foundItemGroup = false;

    // Simple heuristic: find first PackageReference and look backwards for ItemGroup
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("<PackageReference")) {
        // Found a package, search backwards for ItemGroup
        for (let j = i; j >= 0; j--) {
          if (lines[j].includes("<ItemGroup")) {
            addPackageLine = j;
            foundItemGroup = true;
            break;
          }
        }
        if (!foundItemGroup) {
          // If no ItemGroup found immediately before (unlikely in valid csproj but possible), use the package line
          addPackageLine = i;
        }
        break;
      }
    }

    // Add "Add Package" CodeLens
    const addPackageRange = new vscode.Range(
      addPackageLine,
      0,
      addPackageLine,
      0,
    );
    codeLenses.push(
      new vscode.CodeLens(addPackageRange, {
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
        new vscode.CodeLens(addPackageRange, {
          title: `⬆️ Upgrade All (${packagesWithUpdates.length})`,
          command: "yet-another-nuget-package-manager.upgradeAllPackages",
          arguments: [document.uri.fsPath],
          tooltip: `Upgrade all ${packagesWithUpdates.length} packages with available updates`,
        }),
      );
    }

    for (const pkg of packages) {
      const range = new vscode.Range(pkg.line, 0, pkg.line, 0);

      // Check for vulnerabilities - Restore separate CodeLens
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

      // Use the helper to check if current version is prerelease
      const isPrerelease = isPrereleaseVersion(pkg.currentVersion);

      // Only show pre-release update if:
      // 1. We are ALREADY on a pre-release version
      // 2. A newer pre-release exists (newer than stable)
      const hasPrereleaseUpdate =
        isPrerelease && // Key constraint: Must be on pre-release to see pre-release updates
        pkg.latestPrereleaseVersion &&
        pkg.latestVersion &&
        pkg.latestPrereleaseVersion !== pkg.currentVersion &&
        compareVersions(pkg.latestPrereleaseVersion, pkg.latestVersion) > 0;

      if (pkg.isChecking) {
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: "⏳ Checking...",
            command: "",
            tooltip: `Checking for updates to ${pkg.packageName}`,
          }),
        );
      } else if (pkg.isUpdating) {
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: "⏳ Updating...",
            command: "",
            tooltip: `Updating ${pkg.packageName}`,
          }),
        );
      } else {
        // Main Status CodeLens
        let title = "";
        let tooltip = "";

        // If versions failed to load (no latest version and not checking), show error state
        if (!pkg.latestVersion && !pkg.isChecking) {
          title = `⚠️ Version Check Failed`;
          tooltip = `Failed to fetch versions for ${pkg.packageName}. Check package compatibility or internet connection.`;
          // Add a non-functional CodeLens or one that just shows the error
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: title,
              command: "", // No command
              tooltip: tooltip,
            }),
          );
          continue;
        }

        if (hasStableUpdate) {
          title = `⬆️ Update to ${pkg.latestVersion}`;
          tooltip = `Update available: ${pkg.latestVersion}`;
        } else if (hasPrereleaseUpdate) {
          title = `⬆️ Update to ${pkg.latestPrereleaseVersion} (Pre-Release)`;
          tooltip = `Pre-release update available: ${pkg.latestPrereleaseVersion}`;
        } else {
          title = isPrerelease ? `✅ Latest Pre-Release` : `✅ Latest Stable`;
          tooltip = `${pkg.packageName} is up to date`;
        }

        codeLenses.push(
          new vscode.CodeLens(range, {
            title: title,
            command: "yet-another-nuget-package-manager.selectPackageVersion",
            arguments: [
              document.uri.fsPath,
              pkg.packageName,
              pkg.currentVersion,
            ],
            tooltip: tooltip,
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
    const data = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Loading versions for ${packageName}...`,
        cancellable: false,
      },
      async () => {
        const [versions, searchResults] = await Promise.all([
          getPackageVersions(packageName),
          searchPackages(packageName, 1, true),
        ]);

        const allVulnerabilities = await getVulnerabilities(
          packageName,
          "0.0.0",
        );

        return { versions, searchResult: searchResults[0], allVulnerabilities };
      },
    );

    const { versions } = data;

    // Optimization: we can just check the top 50 versions.

    if (versions.length === 0) {
      vscode.window.showWarningMessage(`No versions found for ${packageName}`);
      return;
    }

    // Helper to get download count - Removed unused function
    // const getDownloads = ...

    const latestStable = versions.find((v) => !isPrereleaseVersion(v));
    const latestPre = versions.find((v) => isPrereleaseVersion(v));
    const isCurrentPre = isPrereleaseVersion(currentVersion);

    const items: vscode.QuickPickItem[] = [];

    // 1. Latest Stable Option
    if (latestStable && latestStable !== currentVersion) {
      items.push({
        label: `$(rocket) Update to Latest Stable`,
        description: latestStable,
        detail: `Upgrade to version ${latestStable}`,
        picked: false,
      });
    }

    // 2. Latest Pre-release Option (if newer)
    if (latestPre && latestPre !== currentVersion) {
      // Only show if newer than latest stable or we are currently on pre-release
      if (
        !latestStable ||
        compareVersions(latestPre, latestStable) > 0 ||
        isCurrentPre
      ) {
        items.push({
          label: `$(beaker) Update to Latest Pre-Release`,
          description: latestPre,
          detail: `Upgrade to pre-release ${latestPre}`,
          picked: false,
        });
      }
    }

    // 3. Remove Option
    items.push({
      label: `$(trash) Remove Package`,
      description: "",
      detail: `Remove ${packageName} from this project`,
    });

    items.push({
      label: "",
      kind: vscode.QuickPickItemKind.Separator,
    });

    const displayVersions = versions.slice(0, 50);
    // Ensure current version is in the list
    if (
      !displayVersions.includes(currentVersion) &&
      versions.includes(currentVersion)
    ) {
      displayVersions.push(currentVersion);
      displayVersions.sort((a, b) => compareVersions(b, a));
    }

    for (const v of displayVersions) {
      const isSelected = v === currentVersion;
      const isPre = isPrereleaseVersion(v);

      let icon = isSelected ? "$(check) " : "";
      let description = "";

      if (isSelected) {
        description = "(Current) ";
      }
      if (isPre) {
        description += "(Pre-Release)";
      }

      const vulns = await getVulnerabilities(packageName, v);
      const isVulnerable = vulns.length > 0;

      let label = `${icon}${v}`;
      let detail = "";

      if (isVulnerable) {
        // Warning icon and count moved to detail (under version)
        const highestSeverity = getSeverityLabel(
          Math.max(...vulns.map((x) => x.severity)),
        ).toLowerCase();
        detail = `$(alert) ${vulns.length} Vulnerabilit${vulns.length > 1 ? "ies" : "y"} (${highestSeverity})`;
      }

      items.push({
        label: label,
        description: description.trim(),
        detail: detail.trim(),
        picked: isSelected,
      });
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: `Manage ${packageName} (${currentVersion})`,
      placeHolder: "Select an action or version",
    });

    if (!selected) {
      return;
    }

    if (selected.label.includes("Remove Package")) {
      await handleRemovePackageInline(projectPath, packageName);
      return;
    }

    // Extract version from description or label
    // If it's one of the "Update to..." items, description is the version
    // If it's a version item, the label contains the version (stripped of icons)
    let targetVersion = "";

    if (selected.label.includes("Update to")) {
      targetVersion = selected.description || "";
    } else {
      // Strip icons and spacing
      // Label format: "$(icon) 1.2.3"
      // We can just look up the version in the list that matches
      // Or cleaner: store version in the item? QuickPickItem doesn't have custom data.
      // We'll parse it.
      // The regex above looks for version at end of string.
      // Actually, let's just find the item in our list.
      const versionItem = displayVersions.find((v) =>
        selected.label.includes(v),
      );
      if (versionItem) {
        targetVersion = versionItem;
      } else {
        // Fallback
        targetVersion = selected.label.replace(/\$\([a-z-]+\)/g, "").trim();
      }
    }

    if (targetVersion && targetVersion !== currentVersion) {
      await handleUpdatePackageInline(projectPath, packageName, targetVersion);
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
          quickPick.items = results.map((pkg) => {
            return {
              label: pkg.id,
              description: pkg.version,
              detail: pkg.description
                ? pkg.description.substring(0, 200) +
                  (pkg.description.length > 200 ? "..." : "")
                : "",
              alwaysShow: true,
            };
          });
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
  // Register Hover Provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: "file", language: "xml", pattern: "**/*.csproj" },
      new NuGetHoverProvider(),
    ),
  );

  // Register Document Link Provider
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      { scheme: "file", language: "xml", pattern: "**/*.csproj" },
      new NuGetLinkProvider(),
    ),
  );

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

/**
 * Hover provider for NuGet package references
 */
class NuGetHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | null> {
    const range = document.getWordRangeAtPosition(
      position,
      /Include\s*=\s*["']([^"']+)["']/,
    );
    if (!range) {
      return null;
    }

    const line = document.lineAt(position.line);
    const text = line.text;

    // Check if we're hovering over the package ID part
    const match = /Include\s*=\s*["']([^"']+)["']/.exec(text);
    if (!match) {
      return null;
    }

    // Ensure the hover position is within the package ID string
    const matchIndex = match.index + match[0].indexOf(match[1]);
    const startIndex = matchIndex;
    const endIndex = matchIndex + match[1].length;

    if (position.character < startIndex || position.character > endIndex) {
      return null;
    }

    const packageId = match[1];

    // Fetch metadata
    const metadata = await getPackageMetadata(packageId);
    if (!metadata) {
      return null;
    }

    const content = new vscode.MarkdownString();
    content.isTrusted = true;

    content.appendMarkdown(`### ${metadata.id} ${metadata.version}\n\n`);
    if (metadata.description) {
      content.appendMarkdown(`${metadata.description}\n\n`);
    }

    content.appendMarkdown(`---\n\n`);

    if (metadata.authors.length > 0) {
      content.appendMarkdown(`**Authors:** ${metadata.authors.join(", ")}\n\n`);
    }

    if (metadata.totalDownloads !== undefined) {
      content.appendMarkdown(
        `**Downloads:** ${metadata.totalDownloads.toLocaleString()}\n\n`,
      );
    }

    const links: string[] = [];
    if (metadata.projectUrl) {
      links.push(`[Project Site](${metadata.projectUrl})`);
    }
    if (metadata.licenseUrl) {
      links.push(`[License](${metadata.licenseUrl})`);
    }
    links.push(`[NuGet.org](https://www.nuget.org/packages/${packageId})`);

    content.appendMarkdown(links.join(" | "));

    return new vscode.Hover(content);
  }
}

/**
 * Link provider for NuGet package references (Ctrl+Click)
 */
class NuGetLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();

    // Find all PackageReference includes
    const regex = /Include\s*=\s*["']([^"']+)["']/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const packageId = match[1];
      // Calculate range for the package ID
      const startPos = document.positionAt(
        match.index + match[0].indexOf(packageId),
      );
      const endPos = document.positionAt(
        match.index + match[0].indexOf(packageId) + packageId.length,
      );
      const range = new vscode.Range(startPos, endPos);

      const link = new vscode.DocumentLink(
        range,
        vscode.Uri.parse(`https://www.nuget.org/packages/${packageId}`),
      );
      link.tooltip = `Open ${packageId} on NuGet.org`;
      links.push(link);
    }

    return links;
  }
}

export function clearAllCaches(): void {
  documentPackageCache.clear();
  if (codeLensProvider) {
    codeLensProvider.refresh();
  }
}
