/**
 * Shared message types between extension and webview
 */

export interface Package {
  name: string;
  currentVersion: string;
}

export interface PackageWithLatest extends Package {
  latestVersion: string;
  updateAvailable: boolean;
}

export type ExtensionMessage = 
  | { type: 'packageListUpdate'; data: PackageWithLatest[] }
  | { type: 'error'; message: string }
  | { type: 'operationComplete'; success: boolean; message?: string };

export type WebviewMessage =
  | { command: 'addPackage'; packageName: string; version?: string }
  | { command: 'removePackage'; packageName: string }
  | { command: 'updatePackage'; packageName: string; version: string }
  | { command: 'refresh' };
