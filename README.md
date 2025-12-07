# Yet Another NuGet Package Manager

Yet Another NuGet Package Manager is a Visual Studio Code extension that provides a lightweight, integrated experience for managing NuGet packages in .NET projects using native **CodeLens** actions.

## Features

- **CodeLens-First Design**: Manage packages directly within your `.csproj` files without leaving the editor.
- **Inline Updates**: See available updates (stable and pre-release) right next to your `<PackageReference>` tags.
- **Vulnerability Scanning**: Automatically detects and alerts you about security vulnerabilities in your dependencies with severity indicators.
- **Quick Search & Add**: Easily add new packages by searching NuGet.org via a QuickPick interface.
- **Detailed Metadata**: View package details, license info, and vulnerability reports.
- **Version Control**: Upgrade to specific versions, switch between stable/pre-release, or downgrade easily.
- **Zero Configuration**: Works out of the box by automatically detecting `.csproj` files in your workspace.

## Usage

1.  **Open a `.csproj` file**: The extension automatically activates when you open a C# project file.
2.  **View Actions**: Look for the CodeLens text above or next to your package references.
    *   **Add Package**: Click "➕ Add Package" at the top of the file to search and install new dependencies.
    *   **Update**: Click "⬆️ Update to X.X.X" to instantly upgrade a package.
    *   **Vulnerabilities**: Click on vulnerability warnings (e.g., "⚠️ 2 Vulnerabilities") to view details and severity.
    *   **Manage**: Use "📋 Select version" to choose specific versions or "🔗 NuGet" to view the package on NuGet.org.
    *   **Remove**: Click "🗑️ Remove" to uninstall a package.

## Commands

Most features are accessible via CodeLens, but the following commands are also available in the Command Palette (Ctrl+Shift+P):

- `Update NuGet Package`: Trigger an inline update.
- `Search and Add NuGet Package`: Open the search interface to add a dependency.
- `Show NuGet Package Vulnerabilities`: View security details for a package.
- `Upgrade All NuGet Packages`: Update all packages with available upgrades in the current project.
- `Choose NuGet Project`: Quickly switch between multiple `.csproj` files in your workspace.

## Development

To build and run the extension locally:

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Build the extension:
    ```bash
    npm run build
    ```

3.  Run in VS Code:
    *   Press `F5` to open a new Extension Development Host window.
    *   Open a folder containing a `.NET` project to test the features.

## License

MIT
