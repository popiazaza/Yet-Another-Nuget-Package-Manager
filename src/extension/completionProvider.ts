import * as vscode from "vscode";
import {
  getPackageVersions,
  isPrereleaseVersion,
  searchPackages,
} from "./nugetApi";

/**
 * Completion provider for NuGet package versions and names in .csproj files
 */
export class NuGetCompletionItemProvider
  implements vscode.CompletionItemProvider
{
  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    if (!document.fileName.endsWith(".csproj")) {
      return [];
    }

    const lineText = document.lineAt(position).text;

    // 1. Check for Version attribute completion
    const versionMatch = /Version="([^"]*)/.exec(lineText);
    if (versionMatch) {
      const versionValueStart = versionMatch.index + 'Version="'.length;
      const quoteEnd = lineText.indexOf('"', versionValueStart);
      const versionValueEnd = quoteEnd !== -1 ? quoteEnd : lineText.length;

      if (
        position.character >= versionValueStart &&
        position.character <= versionValueEnd
      ) {
        // Extract package ID from the same line
        const packageMatch = /Include="([^"]+)"/.exec(lineText);
        if (packageMatch) {
          const packageName = packageMatch[1];
          try {
            const versions = await getPackageVersions(packageName);
            return versions.map((version) => {
              const item = new vscode.CompletionItem(
                version,
                vscode.CompletionItemKind.EnumMember,
              );
              item.detail = isPrereleaseVersion(version)
                ? "(Pre-release)"
                : "(Stable)";
              return item;
            });
          } catch {
            return [];
          }
        }
      }
    }

    // 2. Check for Include attribute completion
    const includeMatch = /Include="([^"]*)/.exec(lineText);
    if (includeMatch) {
      const includeValueStart = includeMatch.index + 'Include="'.length;
      const quoteEnd = lineText.indexOf('"', includeValueStart);
      const includeValueEnd = quoteEnd !== -1 ? quoteEnd : lineText.length;

      if (
        position.character >= includeValueStart &&
        position.character <= includeValueEnd
      ) {
        // Use text up to cursor as query
        const query = lineText.substring(includeValueStart, position.character);
        if (query.length < 2) {
          return [];
        }

        try {
          const results = await searchPackages(query, 20, true);
          return results.map((pkg) => {
            const item = new vscode.CompletionItem(
              pkg.id,
              vscode.CompletionItemKind.Module,
            );
            item.detail = pkg.version;
            item.documentation = pkg.description;
            return item;
          });
        } catch {
          return [];
        }
      }
    }

    return [];
  }
}
