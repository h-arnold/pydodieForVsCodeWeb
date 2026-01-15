# See https://aka.ms/vscode-remote/devcontainer.json for format details
FROM mcr.microsoft.com/vscode/devcontainers/typescript-node:0-18

# Install common tools used by the project (Python for docs/tests, build tools)

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    build-essential \
    git \
  && apt-get clean -y \
  && rm -rf /var/lib/apt/lists/*


