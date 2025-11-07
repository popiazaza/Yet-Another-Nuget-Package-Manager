import * as vscode from 'vscode';

/**
 * This method is called when your extension is activated
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Yet Another NuGet Package Manager extension is now active!');

  const disposable = vscode.commands.registerCommand(
    'yet-another-nuget-package-manager.helloWorld',
    () => {
      vscode.window.showInformationMessage('Hello World!');
    }
  );

  context.subscriptions.push(disposable);
}

/**
 * This method is called when your extension is deactivated
 */
export function deactivate() {}
