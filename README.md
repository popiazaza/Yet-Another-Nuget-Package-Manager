# Yet Another NuGet Package Manager

Yet Another NuGet Package Manager is a Visual Studio Code extension that provides a lightweight, integrated experience
for browsing, adding, updating, and removing NuGet packages from .NET projects directly inside VS Code.

Features
-+- Browse and search NuGet packages with descriptions, tags, and download stats
- View package metadata (authors, project URL, license expression or license URL)
- Add packages to the current project or by package id
- Update installed packages (choose versions and upgrade inline)
- Remove packages from the selected project
- View security vulnerabilities and release notes when available

# Yet Another NuGet Package Manager

Yet Another NuGet Package Manager is a Visual Studio Code extension that provides a lightweight, integrated experience
for browsing, adding, updating, and removing NuGet packages from .NET projects directly inside VS Code.

> Note: This extension integrates a React-based webview for a focused package-management UI and communicates with the
> extension backend to run `dotnet` CLI operations. Native `confirm()` dialogs are not available inside VS Code webviews;
> the extension uses in-webview UI for confirmations where needed.

## Features

- Browse and search NuGet packages from NuGet.org
- View rich package metadata: authors, description, tags, download counts, project URL, license expression or license URL
- Add packages to a selected project (choose version or use latest)
- Update installed packages and choose target versions
- Remove packages from the selected project
- View release notes, deprecation notices, and vulnerability information when available
- Multi-project support: select a project (.csproj) from a dropdown
- Theme-aware styling and responsive layout for smaller screens

## Quick Start

1. Open a workspace containing at least one `.csproj` file.
2. Open the Command Palette (Ctrl+Shift+P) and run `Open NuGet Package Manager`, or right-click a `.csproj` in Explorer and choose the command.
3. Select a project (if multiple). Browse or search for packages, then use the right-hand details pane to add, update, or remove packages.

## How it Works

- The extension runs a TypeScript-based backend that executes `dotnet` CLI commands for add/update/remove operations.
- The UI is a React webview that communicates with the backend using the VS Code webview messaging API.
- Package metadata and versions are fetched from the NuGet V3 APIs; some requests may be cached for better performance.

## Commands

- `yet-another-nuget-package-manager.openPackageManager` — Open the package manager UI
- `yet-another-nuget-package-manager.refresh` — Refresh package list
- `yet-another-nuget-package-manager.updatePackageInline` — Update a package inline
- `yet-another-nuget-package-manager.searchAndAddPackage` — Open search/add modal

## Development

Install dependencies and build the extension and webview:

```bash
bun install
bun run build
```

Watch mode (for iterative development):

```bash
bun run watch
```

Run the extension in the VS Code debugger (F5) to test in a development host window.

## Testing

Create a small test project to try the extension:

```bash
dotnet new console -o TestProject
cd TestProject
code .
```

Open the folder in VS Code, run the extension (F5), and test adding/updating/removing packages.

## Release Notes

### 0.0.4
- Documentation updates and small UX improvements

### 0.0.3
- Searchable Add Package modal with real-time NuGet search
- Rich package details (authors, descriptions, downloads, URLs, licenses)
- Release notes and deprecation notices in details view
- Multi-project support and custom NuGet sources

### 0.0.2
- CodeLens integration for inline package status and quick actions
- Vulnerability warnings and pre-release support

### 0.0.1
- Initial release: package discovery, add/update/remove operations, file watching

## License

MIT
