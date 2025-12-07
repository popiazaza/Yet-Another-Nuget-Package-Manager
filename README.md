# Yet Another NuGet Package Manager

Yet Another NuGet Package Manager is a Visual Studio Code extension that provides a lightweight, integrated experience for managing NuGet packages in .NET projects using native **CodeLens** actions.

## Features

- **CodeLens-First Design**: Manage packages directly within your `.csproj` files without leaving the editor.
- **Smart Autocomplete**: IntelliSense support for package names (`Include`) and versions (`Version`) within `.csproj` files.
- **Inline Updates**: See available updates (stable and pre-release) right next to your `<PackageReference>` tags.
- **Vulnerability Scanning**: Automatically detects and alerts you about security vulnerabilities in your dependencies with severity indicators.
- **Quick Search & Add**: Easily add new packages by searching NuGet.org via a QuickPick interface.
- **Detailed Metadata**: View package details, license info, and vulnerability reports.
- **Version Control**: Upgrade to specific versions, switch between stable/pre-release, or downgrade easily.
- **Zero Configuration**: Works out of the box by automatically detecting `.csproj` files in your workspace.
- **Open on NuGet.org**: Ctrl+Click a package ID (or use the "View on NuGet.org" command) to open the package page.

## Usage

1.  **Open a `.csproj` file**: The extension automatically activates when you open a C# project file.
2.  **Auto-Complete Reference**:
    - Start typing `<PackageReference Include="Mic"` to see package suggestions.
    - Type `Version="` to see available versions for that package.
3.  **CodeLens Actions**: Look for the CodeLens text above or next to your package references.
    - **Add Package**: Click "➕ Add Package" at the top of the file to search and install new dependencies.
    - **Vulnerabilities**: Click on vulnerability warnings (e.g., "⚠️ 2 Vulnerabilities") to view details and severity.
    - **Manage**: Use "⬆️ Update to X.X.X" or "✅ Latest" (CodeLens) to update to latest version, pick a specific version, or remove a package. To open the NuGet.org page use Ctrl+Click on the package ID or the "View on NuGet.org" command in the Command Palette.

## Commands

Most features are accessible via CodeLens, but the following commands are also available in the Command Palette (Ctrl+Shift+P):

- `Update NuGet Package`: Trigger an inline update.
- `Search and Add NuGet Package`: Open the search interface to add a dependency.
- `Show NuGet Package Vulnerabilities`: View security details for a package.
- `Upgrade All NuGet Packages`: Update all packages with available upgrades in the current project.

## Development

To build and run the extension locally:

1.  Install dependencies:
    You can use `npm` or `bun` depending on your environment. Examples:

    ```bash
    npm install
    # or, if you prefer bun
    bun install
    ```

2.  Build the extension:

    ```bash
    npm run build
    # or with bun
    bun run build
    ```

3.  Run in VS Code:
    - Press `F5` to open a new Extension Development Host window.
    - Open a folder containing a `.NET` project to test the features.

Optional development tips:

- Run a watch build during development:

```bash
npm run watch
# or
bun run build -- --watch
```

- Run tests (integration with VS Code test runner):

```bash
npm test
```

## License

MIT
