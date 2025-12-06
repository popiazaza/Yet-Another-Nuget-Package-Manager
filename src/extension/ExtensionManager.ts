/**
 * Main extension manager that orchestrates all components
 * Handles lifecycle, communication, and operations
 */

import * as vscode from 'vscode';
import { PackageReference, PackageWithLatest, WebviewMessage, ProjectInfo } from '../types';
import { WebviewManager } from './webviewManager';
import { CsprojFileWatcher } from './fileWatcher';
import { parseCsproj, findCsprojFiles } from './csprojParser';
import { getLatestVersions, getLatestPrereleaseVersion, getUpdateType, getVulnerabilities, searchPackages, getPackageMetadata, compareVersions, isPrereleaseVersion } from './nugetApi';
import { addPackage, removePackage, updatePackage } from './dotnetCli';

export class ExtensionManager {
  private webviewManager: WebviewManager;
  private fileWatcher: CsprojFileWatcher | null = null;
  private currentProjectPath: string | null = null;
  private currentPackages: PackageReference[] = [];
  private allProjects: ProjectInfo[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.webviewManager = new WebviewManager(context);
  }

  /**
   * Start monitoring the workspace for .csproj files
   */
  public async startMonitoring(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    // Find all .csproj files in workspace
    await this.discoverProjects();

    if (this.allProjects.length === 0) {
      console.log('No .csproj files found in workspace');
      return;
    }

    // Default to first project
    this.currentProjectPath = this.allProjects[0].path;
    console.log(`Found ${this.allProjects.length} project(s), using: ${this.currentProjectPath}`);

    // Set up file watcher
    this.fileWatcher = new CsprojFileWatcher();
    this.fileWatcher.watch(async (projectPath) => {
      if (projectPath === this.currentProjectPath) {
        console.log('Project file changed, refreshing...');
        await this.refreshPackageList();
      }
    });
  }

  /**
   * Discover all .csproj files in the workspace
   */
  private async discoverProjects(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.allProjects = [];
      return;
    }

    const projects: ProjectInfo[] = [];
    
    for (const folder of workspaceFolders) {
      const csprojFiles = await findCsprojFiles(folder.uri.fsPath);
      
      for (const filePath of csprojFiles) {
        const parts = filePath.split(/[\\/]/);
        const name = parts[parts.length - 1] || 'Unknown Project';
        projects.push({
          path: filePath,
          name: name.replace('.csproj', ''),
          packages: [],
        });
      }
    }

    this.allProjects = projects;
  }

  /**
   * Open the package manager panel
   */
  public async openPackageManager(clickedFile?: vscode.Uri): Promise<void> {
    // If a file was clicked, use it directly
    if (clickedFile) {
      const filePath = clickedFile.fsPath;
      if (filePath.endsWith('.csproj')) {
        this.currentProjectPath = filePath;
        console.log(`Using clicked .csproj file: ${filePath}`);
      }
    }

    // Discover all projects
    await this.discoverProjects();

    // If no project found yet, try to find one now
    if (!this.currentProjectPath && this.allProjects.length > 0) {
      this.currentProjectPath = this.allProjects[0].path;
    }

    if (!this.currentProjectPath) {
      vscode.window.showErrorMessage(
        'No .csproj file found in workspace. Please open a .NET project folder.'
      );
      return;
    }
    
    // Set up file watching if not already done
    if (!this.fileWatcher) {
      this.fileWatcher = new CsprojFileWatcher();
      this.fileWatcher.watch(async (filePath) => {
        if (filePath === this.currentProjectPath) {
          console.log('Project file changed, refreshing...');
          await this.refreshPackageList();
        }
      });
    }

    // Create the webview panel
    this.webviewManager.createPanel(
      (message) => this.handleWebviewMessage(message),
      () => this.handleWebviewDispose(),
    );

    // Load initial package list
    await this.refreshPackageList();
  }

  /**
   * Refresh the package list
   */
  public async refresh(): Promise<void> {
    await this.refreshPackageList();
  }

  /**
   * Refresh the package list and send to webview
   */
  private async refreshPackageList(): Promise<void> {
    if (!this.currentProjectPath) {
      return;
    }

    try {
      this.webviewManager.sendLoading('Loading packages...');

      // Parse the .csproj file
      const parseResult = await parseCsproj(this.currentProjectPath);

      if (parseResult.error) {
        this.webviewManager.sendError('Failed to parse project file', parseResult.error);
        return;
      }

      // Store the current packages
      this.currentPackages = parseResult.packages;

      // Fetch latest versions and metadata for all packages
      if (this.currentPackages.length > 0) {
        this.webviewManager.sendLoading('Fetching package information...');

        const packageNames = this.currentPackages.map((p) => p.name);
        const latestVersions = await getLatestVersions(packageNames);

        // Fetch prerelease versions, vulnerabilities, and metadata in parallel
        await Promise.all(
          this.currentPackages.map(async (pkg) => {
            const latest = latestVersions.get(pkg.name) || '';
            pkg.latestVersion = latest;
            pkg.isUpdateAvailable = !!latest && latest !== pkg.currentVersion && compareVersions(latest, pkg.currentVersion) > 0;
            
            // Determine update type
            if (pkg.isUpdateAvailable && latest) {
              pkg.updateType = getUpdateType(pkg.currentVersion, latest);
            }

            // Get prerelease version if newer than stable
            const prereleaseVersion = await getLatestPrereleaseVersion(pkg.name);
            if (prereleaseVersion && compareVersions(prereleaseVersion, latest) > 0) {
              pkg.prereleaseVersion = prereleaseVersion;
            }

            // Get vulnerabilities
            const vulns = await getVulnerabilities(pkg.name, pkg.currentVersion);
            if (vulns.length > 0) {
              pkg.vulnerabilities = vulns;
            }

            // Get metadata (authors, description, etc.)
            const metadata = await getPackageMetadata(pkg.name, pkg.currentVersion);
            if (metadata) {
              pkg.metadata = metadata;
            }
          })
        );
      }

      // Send updated list to webview
      const packageListForWebview: PackageWithLatest[] = this.currentPackages.map((pkg) => ({
        name: pkg.name,
        currentVersion: pkg.currentVersion,
        latestVersion: pkg.latestVersion || '',
        updateAvailable: pkg.isUpdateAvailable ?? false,
        updateType: pkg.updateType,
        metadata: pkg.metadata,
        vulnerabilities: pkg.vulnerabilities,
        prereleaseVersion: pkg.prereleaseVersion,
      }));

      this.webviewManager.updatePackageList(packageListForWebview, this.currentProjectPath, this.allProjects);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error refreshing package list: ${errorMessage}`);
      this.webviewManager.sendError('Error loading packages', errorMessage);
    }
  }

  /**
   * Handle messages from the webview
   */
  private async handleWebviewMessage(message: WebviewMessage): Promise<void> {
    try {
      switch (message.command) {
        case 'refresh':
          await this.refreshPackageList();
          break;

        case 'addPackage':
          await this.handleAddPackage(message.packageName, message.version, message.projectPath);
          break;

        case 'removePackage':
          await this.handleRemovePackage(message.packageName, message.projectPath);
          break;

        case 'updatePackage':
          await this.handleUpdatePackage(message.packageName, message.version, message.projectPath);
          break;

        case 'searchPackages':
          await this.handleSearchPackages(message.query, message.includePrerelease);
          break;

        case 'getPackageMetadata':
          await this.handleGetPackageMetadata(message.packageName);
          break;

        case 'getPackageVersions':
          await this.handleGetPackageVersions(message.packageName);
          break;

        case 'selectProject':
          await this.handleSelectProject(message.projectPath);
          break;

        case 'upgradeAllPackages':
          await this.handleUpgradeAllPackages(message.mode);
          break;

        default:
          console.warn('Unknown command received from webview:', String(message));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error handling webview message: ${errorMessage}`);
      this.webviewManager.sendError('Error processing command', errorMessage);
    }
  }

  /**
   * Handle search packages command
   */
  private async handleSearchPackages(query: string, includePrerelease?: boolean): Promise<void> {
    try {
      const results = await searchPackages(query, 30, includePrerelease ?? false);
      this.webviewManager.postMessage({
        type: 'searchResults',
        results,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.webviewManager.sendError('Failed to search packages', errorMessage);
    }
  }

  /**
   * Handle get package metadata command
   */
  private async handleGetPackageMetadata(packageName: string): Promise<void> {
    try {
      const metadata = await getPackageMetadata(packageName);
      if (metadata) {
        this.webviewManager.postMessage({
          type: 'packageMetadata',
          packageName,
          metadata,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error getting package metadata: ${errorMessage}`);
    }
  }

  /**
   * Handle get package versions command - fetches full package data from search API
   */
  private async handleGetPackageVersions(packageName: string): Promise<void> {
    try {
      console.log(`Fetching versions for package: ${packageName}`);
      const results = await searchPackages(packageName, 1, true);
      console.log(`Search results for ${packageName}:`, results.length);
      const packageData = results.find((r) => r.id.toLowerCase() === packageName.toLowerCase());
      if (packageData) {
        console.log(`Found package data for ${packageName}, versions: ${packageData.versions?.length || 0}`);
        this.webviewManager.postMessage({
          type: 'packageVersions',
          packageName,
          versions: packageData.versions || [],
          // Include all the rich data from search API
          searchData: packageData,
        });
      } else {
        console.log(`No package data found for ${packageName}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error getting package versions: ${errorMessage}`);
    }
  }

  /**
   * Handle select project command
   */
  private async handleSelectProject(projectPath: string): Promise<void> {
    this.currentProjectPath = projectPath;
    await this.refreshPackageList();
  }

  /**
   * Handle add package command
   */
  private async handleAddPackage(packageName: string, version?: string, projectPath?: string): Promise<void> {
    const targetProject = projectPath || this.currentProjectPath;
    if (!targetProject) {
      return;
    }

    try {
      this.webviewManager.sendLoading(`Adding package ${packageName}...`);

      const result = await addPackage({
        projectPath: targetProject,
        packageName,
        version,
      });

      if (result.success) {
        vscode.window.showInformationMessage(`Successfully added ${packageName}`);
        await this.refreshPackageList();
      } else {
        const errorMsg = result.stderr || 'Unknown error';
        vscode.window.showErrorMessage(`Failed to add package: ${errorMsg}`);
        this.webviewManager.sendError('Failed to add package', errorMsg);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.webviewManager.sendError('Error adding package', errorMessage);
    }
  }

  /**
   * Handle remove package command
   */
  private async handleRemovePackage(packageName: string, projectPath?: string): Promise<void> {
    const targetProject = projectPath || this.currentProjectPath;
    if (!targetProject) {
      return;
    }

    try {
      this.webviewManager.sendLoading(`Removing package ${packageName}...`);

      const result = await removePackage({
        projectPath: targetProject,
        packageName,
      });

      if (result.success) {
        vscode.window.showInformationMessage(`Successfully removed ${packageName}`);
        await this.refreshPackageList();
      } else {
        const errorMsg = result.stderr || 'Unknown error';
        vscode.window.showErrorMessage(`Failed to remove package: ${errorMsg}`);
        this.webviewManager.sendError('Failed to remove package', errorMsg);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.webviewManager.sendError('Error removing package', errorMessage);
    }
  }

  /**
   * Handle update package command
   */
  private async handleUpdatePackage(packageName: string, version: string, projectPath?: string): Promise<void> {
    const targetProject = projectPath || this.currentProjectPath;
    if (!targetProject) {
      this.webviewManager.sendError('No project selected', 'Please select a project first');
      return;
    }

    if (!packageName) {
      this.webviewManager.sendError('Invalid package', 'Package name is required');
      return;
    }

    try {
      this.webviewManager.sendLoading(`Updating package ${packageName}...`);

      const result = await updatePackage({
        projectPath: targetProject,
        packageName,
        version,
      });

      if (result.success) {
        vscode.window.showInformationMessage(`Successfully updated ${packageName} to ${version}`);
        await this.refreshPackageList();
      } else {
        const errorMsg = result.stderr || 'Unknown error';
        vscode.window.showErrorMessage(`Failed to update ${packageName}: ${errorMsg}`);
        this.webviewManager.sendError(`Failed to update ${packageName}`, errorMsg);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.webviewManager.sendError(`Error updating ${packageName}`, errorMessage);
    }
  }

  /**
   * Handle upgrade all packages command
   * @param mode - 'all' (respect prerelease), 'minor' (minor updates only), 'major' (include major updates)
   */
  private async handleUpgradeAllPackages(mode: 'all' | 'minor' | 'major'): Promise<void> {
    const targetProject = this.currentProjectPath;
    if (!targetProject) {
      this.webviewManager.sendError('No project selected', 'Please select a project first');
      return;
    }

    // Get packages that need updating
    const packagesToUpdate = this.currentPackages.filter((pkg) => {
      if (!pkg.latestVersion || !pkg.isUpdateAvailable) {
        return false;
      }

      // Check if current version is a prerelease
      const currentIsPrerelease = isPrereleaseVersion(pkg.currentVersion);
      
      // Determine target version based on mode
      if (mode === 'minor') {
        // Only update if it's a minor or patch update
        return pkg.updateType === 'minor' || pkg.updateType === 'patch';
      } else if (mode === 'major') {
        // Include all updates including major
        return true;
      } else {
        // 'all' mode - respect prerelease status
        // If current is prerelease, we can update to newer prerelease
        // If current is stable, don't push to prerelease
        if (currentIsPrerelease) {
          return true; // Allow any update for prerelease packages
        } else {
          // For stable packages, only update to stable versions
          return !isPrereleaseVersion(pkg.latestVersion);
        }
      }
    });

    if (packagesToUpdate.length === 0) {
      vscode.window.showInformationMessage('No packages to update with the selected criteria.');
      return;
    }

    try {
      this.webviewManager.sendLoading(`Upgrading ${packagesToUpdate.length} package(s)...`);

      let successCount = 0;
      let failCount = 0;
      const failedPackages: string[] = [];

      for (const pkg of packagesToUpdate) {
        // Determine the target version
        let targetVersion = pkg.latestVersion!;
        
        // For 'all' mode with prerelease packages, prefer prerelease if available
        if (mode === 'all' && isPrereleaseVersion(pkg.currentVersion) && pkg.prereleaseVersion) {
          targetVersion = pkg.prereleaseVersion;
        }

        const result = await updatePackage({
          projectPath: targetProject,
          packageName: pkg.name,
          version: targetVersion,
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
          failedPackages.push(pkg.name);
        }
      }

      if (failCount === 0) {
        vscode.window.showInformationMessage(`Successfully upgraded ${successCount} package(s)`);
      } else {
        vscode.window.showWarningMessage(
          `Upgraded ${successCount} package(s), ${failCount} failed: ${failedPackages.join(', ')}`
        );
      }

      await this.refreshPackageList();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.webviewManager.sendError('Error upgrading packages', errorMessage);
    }
  }

  /**
   * Handle webview dispose
   */
  private handleWebviewDispose(): void {
    console.log('Webview disposed');
  }

  /**
   * Dispose and clean up resources
   */
  public dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }

    this.webviewManager.dispose();
  }
}
