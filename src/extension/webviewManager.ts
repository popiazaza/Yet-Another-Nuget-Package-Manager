/**
 * Webview manager for handling the package manager UI
 * Manages webview panel lifecycle and communication with the extension
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { PackageWithLatest, ExtensionMessage, WebviewMessage, ProjectInfo } from '../types';

export type OnWebviewMessageCallback = (message: WebviewMessage) => Promise<void>;
export type OnWebviewDisposeCallback = () => void;

/**
 * WebviewManager class handles the package manager webview
 */
export class WebviewManager {
  private panel: vscode.WebviewPanel | null = null;
  private onMessageCallback: OnWebviewMessageCallback | null = null;
  private onDisposeCallback: OnWebviewDisposeCallback | null = null;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Create and show the webview panel
   * @param onMessage - Callback for messages from webview
   * @param onDispose - Callback when webview is disposed
   */
  public createPanel(
    onMessage: OnWebviewMessageCallback,
    onDispose: OnWebviewDisposeCallback,
  ): void {
    console.log('Creating webview panel...');
    this.onMessageCallback = onMessage;
    this.onDisposeCallback = onDispose;

    // If panel already exists, reveal it
    if (this.panel) {
      console.log('Panel already exists, revealing it...');
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    try {
      // Create new webview panel
      this.panel = vscode.window.createWebviewPanel(
        'nugetPackageManager',
        'NuGet Package Manager',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(this.context.extensionPath, 'dist')),
          ],
          retainContextWhenHidden: true,
        },
      );

      console.log('Webview panel created successfully');

      // Set the webview's HTML content
      this.updateWebviewContent();

      // Handle messages from the webview
      this.panel.webview.onDidReceiveMessage(
        (message) => {
          this.handleWebviewMessage(message);
        },
        undefined,
        [],
      );

      // Handle panel disposal
      this.panel.onDidDispose(() => {
        console.log('Webview panel disposed');
        this.panel = null;
        if (this.onDisposeCallback) {
          this.onDisposeCallback();
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error creating webview panel: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Update the webview HTML content
   */
  private updateWebviewContent(): void {
    if (!this.panel) {
      return;
    }

    try {
      const webview = this.panel.webview;
      const distPath = path.join(this.context.extensionPath, 'dist', 'webview.js');
      const cssPath = path.join(this.context.extensionPath, 'dist', 'style.css');
      const scriptUri = webview.asWebviewUri(vscode.Uri.file(distPath));
      const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath));
      const nonce = getNonce();
      
      console.log(`Creating webview with script from: ${distPath}`);
      console.log(`Webview URI: ${scriptUri}`);

      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src https: ${webview.cspSource};">
          <title>NuGet Package Manager</title>
          <link rel="stylesheet" href="${cssUri}">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              color: var(--vscode-editor-foreground);
              background-color: var(--vscode-editor-background);
              margin: 0;
              padding: 0;
            }
            * {
              box-sizing: border-box;
            }
          </style>
        </head>
        <body>
          <div id="root"></div>
          <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>
      `;

      this.panel.webview.html = html;
      console.log('Webview HTML set successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error updating webview content: ${errorMessage}`);
    }
  }

  /**
   * Handle messages received from the webview
   * @param message - Message from webview
   */
  private async handleWebviewMessage(message: unknown): Promise<void> {
    try {
      if (this.onMessageCallback) {
        await this.onMessageCallback(message as WebviewMessage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error handling webview message: ${errorMessage}`);
    }
  }

  /**
   * Send a message to the webview
   * @param message - Message to send
   */
  public postMessage(message: ExtensionMessage): void {
    if (this.panel) {
      this.panel.webview.postMessage(message);
    }
  }

  /**
   * Update the UI with a new package list
   * @param packages - Array of packages to display
   * @param projectPath - Path to the project file
   * @param projects - Optional array of all available projects
   */
  public updatePackageList(packageList: PackageWithLatest[], projectPath: string, projects?: ProjectInfo[]): void {
    this.postMessage({
      type: 'packageListUpdate',
      projectPath,
      data: packageList,
      projects,
    });
  }

  /**
   * Send an error message to the webview
   * @param error - Error message
   * @param details - Optional detailed error information
   */
  public sendError(error: string, details?: string): void {
    this.postMessage({
      type: 'error',
      error,
      details,
      message: error,
    });
  }

  /**
   * Send a loading message to the webview
   * @param message - Loading message
   */
  public sendLoading(message: string): void {
    this.postMessage({
      type: 'loading',
      message,
    });
  }

  /**
   * Send an operation complete message
   * @param success - Whether the operation succeeded
   * @param message - Status message
   * @param packages - Optional updated package list
   */
  public sendOperationComplete(
    success: boolean,
    message: string,
    packages?: PackageWithLatest[],
  ): void {
    this.postMessage({
      type: 'operationComplete',
      success,
      message,
      packages,
    });
  }

  /**
   * Check if the panel is visible
   */
  public isVisible(): boolean {
    return this.panel !== null;
  }

  /**
   * Reveal the panel
   */
  public reveal(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
    }
  }

  /**
   * Dispose of the webview and clean up resources
   */
  public dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
    this.onMessageCallback = null;
    this.onDisposeCallback = null;
  }
}

/**
 * Create a webview manager instance
 * @param context - VS Code extension context
 * @returns WebviewManager instance
 */
export function createWebviewManager(context: vscode.ExtensionContext): WebviewManager {
  return new WebviewManager(context);
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
