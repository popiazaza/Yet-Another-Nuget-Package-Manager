# Changelog

All notable user-facing changes are listed below. Entries are written for a general audience (less technical jargon).

## 0.0.7 - 2025-12-08

- Improved documentation and guidance: The README now links directly to NuGet.org and includes clearer instructions for managing packages from the extension.
- Better project file parsing: Updated the internal parser for .csproj files to be faster and more reliable, which reduces errors when reading or updating package references.
- Smarter package editing: Autocomplete for package names and versions when editing `.csproj` files, and improved handling for updating package versions and scanning for known issues.

## 0.0.6 - 2025-12-07

- Search and view packages in-place: A polished UI now lets you search NuGet, view package details (author, description, downloads, license), and add packages without leaving the editor.
- Inline status & warnings: Package status indicators and vulnerability badges appear next to packages so you can spot issues quickly.
- Usability and polish: Several UI and accessibility improvements make package operations smoother and clearer.

## 0.0.5 - 2025-12-02

- Build and packaging improvements: Internal build scripts and tooling were updated to make releases more reliable.

## 0.0.4

- Documentation refinements and user experience improvements across the extension:
  - Clarified usage instructions in the README.
  - Minor interface tweaks to make common actions easier to discover.

## 0.0.3

- Improved package discovery and details:
  - A searchable "Add Package" modal with live NuGet.org results.
  - Detailed package view including authors, descriptions, download counts, project URLs, and license information.
  - Display of release notes and deprecation notices where available.
  - Support for working with multiple projects and adding custom NuGet sources.

## 0.0.2

- Productivity features:
  - CodeLens integration showing inline package status and quick actions.
  - Warnings for known vulnerabilities and support for pre-release package versions.

## 0.0.1

- Initial release:
  - Basic package discovery, add/update/remove operations, and file watching to pick up project changes.

---

If you'd like the changelog reorganized (for example, grouping breaking changes separately, adding links to specific release commits or PRs, or expanding any bullet into more detail), tell me which style you prefer and I'll update it.

# Change Log

All notable changes to the "yet-another-nuget-package-manager" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Initial release
