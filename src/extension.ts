// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionManager } from './extension/ExtensionManager';
import { registerCsprojFeatures } from './extension/csprojDecorations';

let extensionManager: ExtensionManager | null = null;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  console.log('NuGet Package Manager extension is activating...');

  try {
    // Initialize the extension manager
    extensionManager = new ExtensionManager(context);

    // Register .csproj inline decorations and CodeLens features
    registerCsprojFeatures(context);

    // Register the open command
    const openDisposable = vscode.commands.registerCommand(
      'yet-another-nuget-package-manager.openPackageManager',
      async (clickedFile?: vscode.Uri) => {
        console.log('Opening NuGet Package Manager...', clickedFile?.fsPath);
        if (extensionManager) {
          try {
            await extensionManager.openPackageManager(clickedFile);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error opening package manager: ${errorMessage}`);
            vscode.window.showErrorMessage(`Error opening package manager: ${errorMessage}`);
          }
        }
      },
    );

    // Register the refresh command
    const refreshDisposable = vscode.commands.registerCommand(
      'yet-another-nuget-package-manager.refresh',
      async () => {
        console.log('Refreshing package list...');
        if (extensionManager) {
          try {
            await extensionManager.refresh();
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error refreshing packages: ${errorMessage}`);
            vscode.window.showErrorMessage(`Error refreshing packages: ${errorMessage}`);
          }
        }
      },
    );

    context.subscriptions.push(openDisposable, refreshDisposable);

    // Start monitoring the workspace (non-blocking)
    extensionManager.startMonitoring().catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Error starting monitoring: ${errorMessage}`);
    });

    console.log('NuGet Package Manager extension activated successfully!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to activate extension: ${errorMessage}`);
    vscode.window.showErrorMessage(
      `Failed to activate NuGet Package Manager: ${errorMessage}`,
    );
  }
}

// This method is called when your extension is deactivated
export function deactivate() {
  console.log('NuGet Package Manager extension is deactivating...');
  if (extensionManager) {
    extensionManager.dispose();
    extensionManager = null;
  }
}
