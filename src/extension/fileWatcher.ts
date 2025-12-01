/**
 * File system watcher for .csproj changes
 * Monitors for external modifications to project files
 */

import * as vscode from 'vscode';

export type OnCsprojChangeCallback = (projectPath: string) => Promise<void>;

/**
 * FileWatcher class manages monitoring .csproj files for changes
 */
export class CsprojFileWatcher {
  private watcher: vscode.FileSystemWatcher | null = null;
  private onChangeCallback: OnCsprojChangeCallback | null = null;
  private disposables: vscode.Disposable[] = [];

  /**
   * Start watching for .csproj file changes
   * @param onChangeCallback - Callback function to invoke when a .csproj file changes
   */
  public watch(onChangeCallback: OnCsprojChangeCallback): void {
    this.onChangeCallback = onChangeCallback;

    // Create a file system watcher for .csproj files
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.csproj');

    // Listen for file changes
    const changeDisposable = this.watcher.onDidChange((uri) => {
      this.handleFileChange(uri);
    });

    // Listen for file creation
    const createDisposable = this.watcher.onDidCreate((uri) => {
      this.handleFileChange(uri);
    });

    // Listen for file deletion
    const deleteDisposable = this.watcher.onDidDelete((uri) => {
      this.handleFileChange(uri);
    });

    this.disposables.push(changeDisposable, createDisposable, deleteDisposable, this.watcher);
  }

  /**
   * Handle file change event
   * @param uri - URI of the changed file
   */
  private async handleFileChange(uri: vscode.Uri): Promise<void> {
    if (this.onChangeCallback) {
      try {
        await this.onChangeCallback(uri.fsPath);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error in file watcher callback: ${errorMessage}`);
      }
    }
  }

  /**
   * Stop watching and clean up resources
   */
  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.watcher = null;
    this.onChangeCallback = null;
  }

  /**
   * Check if watcher is active
   */
  public isActive(): boolean {
    return this.watcher !== null;
  }
}

/**
 * Create a file watcher instance
 * @param onChangeCallback - Callback when files change
 * @returns CsprojFileWatcher instance
 */
export function createCsprojWatcher(onChangeCallback: OnCsprojChangeCallback): CsprojFileWatcher {
  const watcher = new CsprojFileWatcher();
  watcher.watch(onChangeCallback);
  return watcher;
}
