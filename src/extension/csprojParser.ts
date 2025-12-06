/**
 * Parser for .csproj XML files
 * Extracts PackageReference elements and converts to PackageReference objects
 */

import * as fs from "fs";
import * as xml2js from "xml2js";
import { PackageReference, ParseCsprojResult } from "../types";

const xmlParser = new xml2js.Parser();

/**
 * Parse a .csproj file and extract package references
 * @param projectPath - Absolute path to the .csproj file
 * @returns ParseCsprojResult with packages or error
 */
export async function parseCsproj(
  projectPath: string,
): Promise<ParseCsprojResult> {
  try {
    // Read the .csproj file
    const fileContent = fs.readFileSync(projectPath, "utf-8");

    // Parse XML
    const parsedXml = await xmlParser.parseStringPromise(fileContent);

    // Extract PackageReference elements from the project
    const packages: PackageReference[] = [];

    // Navigate through the XML structure: Project -> ItemGroup -> PackageReference
    if (parsedXml.Project && parsedXml.Project.ItemGroup) {
      const itemGroups = Array.isArray(parsedXml.Project.ItemGroup)
        ? parsedXml.Project.ItemGroup
        : [parsedXml.Project.ItemGroup];

      for (const itemGroup of itemGroups) {
        if (itemGroup.PackageReference) {
          const packageRefs = Array.isArray(itemGroup.PackageReference)
            ? itemGroup.PackageReference
            : [itemGroup.PackageReference];

          for (const ref of packageRefs) {
            const name = ref.$.Include;
            const currentVersion = ref.$.Version;

            if (name && currentVersion) {
              packages.push({
                name,
                currentVersion,
                latestVersion: undefined,
                isUpdateAvailable: false,
              });
            }
          }
        }
      }
    }

    // Sort packages alphabetically by name
    packages.sort((a, b) => a.name.localeCompare(b.name));

    return {
      packages,
      projectPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      packages: [],
      projectPath,
      error: `Failed to parse .csproj file: ${errorMessage}`,
    };
  }
}

/**
 * Find all .csproj files in a workspace folder
 * @param workspacePath - Root path of the workspace
 * @returns Array of .csproj file paths
 */
export async function findCsprojFiles(
  workspacePath: string,
): Promise<string[]> {
  const csprojFiles: string[] = [];

  function walkDir(dir: string): void {
    try {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const filePath = `${dir}\\${file}`;
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          // Skip common non-project directories
          if (
            !file.startsWith(".") &&
            file !== "node_modules" &&
            file !== "bin" &&
            file !== "obj" &&
            file !== "packages"
          ) {
            walkDir(filePath);
          }
        } else if (file.endsWith(".csproj")) {
          csprojFiles.push(filePath);
        }
      }
    } catch (error) {
      // Skip directories we can't access
    }
  }

  walkDir(workspacePath);
  return csprojFiles;
}

/**
 * Get the first .csproj file in a workspace (for single-project support)
 * @param workspacePath - Root path of the workspace
 * @returns Path to first .csproj file, or undefined if none found
 */
export async function getFirstCsproj(
  workspacePath: string,
): Promise<string | undefined> {
  const files = await findCsprojFiles(workspacePath);
  return files.length > 0 ? files[0] : undefined;
}
