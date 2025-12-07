import * as vscode from "vscode";
import { getPackageVersions, isPrereleaseVersion } from "./nugetApi";

/**
 * Completion provider for NuGet package versions in .csproj files
 */
export class NuGetCompletionItemProvider implements vscode.CompletionItemProvider {
  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    if (!document.fileName.endsWith(".csproj")) {
      return [];
    }

    const lineText = document.lineAt(position).text;

    // Check if cursor is inside Version attribute
    const versionMatch = /Version="([^"]*)/.exec(lineText);
    if (!versionMatch) {
      return [];
    }

    // Verify cursor is within the Version="" value
    const versionValueStart = versionMatch.index + 'Version="'.length;
    // Quote might not be closed yet during typing, or it is closed
    const quoteEnd = lineText.indexOf('"', versionValueStart);
    const versionValueEnd = quoteEnd !== -1 ? quoteEnd : lineText.length;

    if (position.character < versionValueStart || position.character > versionValueEnd) {
      return [];
    }

    // Extract package ID from the same line
    const packageMatch = /Include="([^"]+)"/.exec(lineText);
    if (!packageMatch) {
      return [];
    }

    const packageName = packageMatch[1];

    try {
      const versions = await getPackageVersions(packageName);
      return versions.map((version) => {
        const item = new vscode.CompletionItem(version, vscode.CompletionItemKind.EnumMember);
        item.detail = isPrereleaseVersion(version) ? "(Pre-release)" : "(Stable)";
        return item;
      });
    } catch {
      return [];
    }
  }
}
