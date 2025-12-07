import * as vscode from "vscode";
import { getPackageVersions, isPrereleaseVersion } from "./nugetApi";

/**
 * Completion provider for NuGet package versions in .csproj files
 */
export class NuGetCompletionItemProvider implements vscode.CompletionItemProvider {
  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): Promise<vscode.CompletionItem[]> {
    // Only trigger if we are in a .csproj file (sanity check, usually redundant if registered correctly)
    if (!document.fileName.endsWith(".csproj")) {
      return [];
    }

    // Get the current line
    const line = document.lineAt(position);
    const lineText = line.text;

    // Check if we are inside a PackageReference Version attribute
    // Regex matches: <PackageReference Include="PackageId" ... Version="...
    // We want to capture the package ID
    const packageReferenceRegex = /<PackageReference\s+(?:\w+="[^"]*"\s+)*Include="([^"]+)"(?:\s+\w+="[^"]*")*\s+Version="([^"]*)/i;
    const match = packageReferenceRegex.exec(lineText);

    if (!match) {
      return [];
    }

    const packageName = match[1];


    // Ensure cursor is within the Version attribute value
    // match.index is start of match
    // match[0] is the whole match string up to the cursor ideally, but regex might match early part
    // Let's verify cursor position more strictly if needed, but for now assuming the regex match implies we are at a valid spot if it ends right before or around cursor.
    // Actually simplicity: check if we are inside Version=""
    const versionAttrIndex = lineText.indexOf('Version="');
    if (versionAttrIndex === -1) {
      return [];
    }

    const versionStartIndex = versionAttrIndex + 'Version="'.length;
    const versionEndIndex = lineText.indexOf('"', versionStartIndex);
    
    // If quote is closed, check if cursor is between quotes
    if (versionEndIndex !== -1) {
      if (position.character < versionStartIndex || position.character > versionEndIndex) {
        return []; // Cursor outside Version=""
      }
    } else {
      // Quote not closed yet, check if cursor is after start
      if (position.character < versionStartIndex) {
        return [];
      }
    }

    try {
      // Fetch versions
      const versions = await getPackageVersions(packageName);

      if (versions.length === 0) {
        return [];
      }

      // Filter based on what user already typed if needed, but VS Code handles fuzzy matching usually.
      // However, for large lists, we might want to be careful.
      // For now, return all versions (capped by API usually).

      return versions.map((version) => {
        const item = new vscode.CompletionItem(version, vscode.CompletionItemKind.EnumMember);
        item.detail = isPrereleaseVersion(version) ? "(Pre-release)" : "(Stable)";
        
        // Sort keys to keep order: Latest stable first usually.
        // Assuming versions are returned sorted from API (usually new to old).
        // VS Code sorts by label by default, we want preservation of order if possible or semantic sort.
        // Let's set sortText to ensure order.
        // 000_version ensure it comes first.
        // But versions are potentially many.
        return item;
      });

    } catch (error) {
      console.error(`Error fetching versions for ${packageName}:`, error);
      return [];
    }
  }
}
