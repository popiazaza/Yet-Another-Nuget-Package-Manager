/**
 * Parser for .csproj XML files
 * Extracts PackageReference elements and converts to PackageReference objects
 */

import * as fs from "fs";
import { XMLParser } from "fast-xml-parser";
import { PackageReference, ParseCsprojResult } from "../types";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Ensure arrays for ItemGroup and PackageReference to simplify traversal
  isArray: (name) => {
    return name === "ItemGroup" || name === "PackageReference";
  },
});

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
    const parsedXml = xmlParser.parse(fileContent);

    // Extract PackageReference elements from the project
    const packages: PackageReference[] = [];

    // Navigate through the XML structure: Project -> ItemGroup -> PackageReference
    if (parsedXml.Project && parsedXml.Project.ItemGroup) {
      // ItemGroup is guaranteed to be an array due to isArray option
      const itemGroups = parsedXml.Project.ItemGroup;

      for (const itemGroup of itemGroups) {
        if (itemGroup.PackageReference) {
          // PackageReference is guaranteed to be an array due to isArray option
          const packageRefs = itemGroup.PackageReference;

          for (const ref of packageRefs) {
            const name = ref["@_Include"];
            const currentVersion = ref["@_Version"];

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
