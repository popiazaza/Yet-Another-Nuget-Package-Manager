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

