# Dev Container for pydodideForVsCodeWeb

This dev container provides a pre-configured development environment for the project:

- Node.js (TypeScript/webpack) via the `typescript-node` devcontainer image
- Python 3 and build-essential for tooling/test needs
- Recommended VS Code extensions: ESLint, Prettier, Python, and Jupyter

Usage

1. Install the "Dev Containers" extension in VS Code (Remote - Containers).
2. Open this repository in VS Code.
3. Reopen in container (Command Palette → Remote-Containers: Reopen in Container).

When the container is created, `npm ci && npm run compile` will run automatically (see `postCreateCommand`).