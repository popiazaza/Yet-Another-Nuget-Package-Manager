/**
 * Wrapper around dotnet CLI commands
 * Handles package add, remove, and update operations
 */

import { spawn } from "child_process";
import {
  DotnetCliResult,
  AddPackageOptions,
  RemovePackageOptions,
  NuGetSource,
} from "../types";

/**
 * Execute a dotnet CLI command
 * @param args - Command line arguments for dotnet
 * @param projectPath - Optional project directory
 * @returns Promise with stdout, stderr, and success flag
 */
function executeDotnetCommand(
  args: string[],
  projectPath?: string,
): Promise<DotnetCliResult> {
  return new Promise((resolve) => {
    const options = projectPath ? { cwd: projectPath } : {};

    const process = spawn("dotnet", args, {
      ...options,
      shell: true, // Use shell to handle Windows path issues
    });

    let stdout = "";
    let stderr = "";

    process.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
      });
    });

    process.on("error", (error) => {
      resolve({
        success: false,
        stdout,
        stderr,
        error,
      });
    });
  });
}

/**
 * Add a NuGet package to a project
 * @param options - AddPackageOptions with packageName, version, etc
 * @returns Promise with result of the operation
 */
export async function addPackage(
  options: AddPackageOptions,
): Promise<DotnetCliResult> {
  const { projectPath, packageName, version, prerelease, source } = options;
  const args = ["add", projectPath, "package", packageName];

  if (version) {
    args.push("--version", version);
  }

  if (prerelease) {
    args.push("--prerelease");
  }

  if (source) {
    args.push("--source", source);
  }

  return executeDotnetCommand(args);
}

/**
 * Remove a NuGet package from a project
 * @param options - RemovePackageOptions with packageName
 * @returns Promise with result of the operation
 */
export async function removePackage(
  options: RemovePackageOptions,
): Promise<DotnetCliResult> {
  const args = ["remove", options.projectPath, "package", options.packageName];
  return executeDotnetCommand(args);
}

/**
 * Update a package to a specific version
 * @param options - AddPackageOptions with new version
 * @returns Promise with result of the operation (uses add command with version)
 */
export async function updatePackage(
  options: AddPackageOptions,
): Promise<DotnetCliResult> {
  // The dotnet CLI doesn't have an update command; we use add with the version
  return addPackage(options);
}

/**
 * Get the dotnet version (for diagnostics)
 * @returns Promise with dotnet version string
 */
export async function getDotnetVersion(): Promise<string> {
  const result = await executeDotnetCommand(["--version"]);
  return result.success ? result.stdout.trim() : "Unknown";
}

/**
 * List configured NuGet sources
 * @returns Promise with array of NuGet sources
 */
export async function listNugetSources(): Promise<NuGetSource[]> {
  const result = await executeDotnetCommand(["nuget", "list", "source"]);
  if (!result.success) {
    return [
      {
        name: "nuget.org",
        url: "https://api.nuget.org/v3/index.json",
        isEnabled: true,
        isDefault: true,
      },
    ];
  }

  const sources: NuGetSource[] = [];
  const lines = result.stdout.split("\n");
  let currentSource: Partial<NuGetSource> | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Match source name with enabled/disabled status
    const nameMatch = trimmedLine.match(
      /^\d+\.\s+(.+?)\s+\[(Enabled|Disabled)\]$/,
    );
    if (nameMatch) {
      if (currentSource && currentSource.name && currentSource.url) {
        sources.push(currentSource as NuGetSource);
      }
      currentSource = {
        name: nameMatch[1],
        isEnabled: nameMatch[2] === "Enabled",
      };
    }

    // Match source URL
    if (currentSource && trimmedLine.startsWith("http")) {
      currentSource.url = trimmedLine;
    }
  }

  // Add last source if exists
  if (currentSource && currentSource.name && currentSource.url) {
    sources.push(currentSource as NuGetSource);
  }

  // Mark nuget.org as default
  for (const source of sources) {
    if (source.url?.includes("nuget.org")) {
      source.isDefault = true;
    }
  }

  // If no sources found, return default
  if (sources.length === 0) {
    return [
      {
        name: "nuget.org",
        url: "https://api.nuget.org/v3/index.json",
        isEnabled: true,
        isDefault: true,
      },
    ];
  }

  return sources;
}
