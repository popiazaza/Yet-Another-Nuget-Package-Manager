import * as vscode from "vscode";
import { registerCsprojFeatures } from "./extension/csprojDecorations";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  console.log("NuGet Package Manager extension is activating...");

  try {
    registerCsprojFeatures(context);
    console.log("NuGet Package Manager extension activated successfully!");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to activate extension: ${errorMessage}`);
    vscode.window.showErrorMessage(
      `Failed to activate NuGet Package Manager: ${errorMessage}`,
    );
  }
}

export function deactivate(): void {
  console.log("NuGet Package Manager extension is deactivating...");
}
