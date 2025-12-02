# DevContainer Setup Guide

## What is a DevContainer?

A DevContainer allows you to develop inside a Docker container with all dependencies pre-installed. This means:

✅ **No host dependencies** - No need to install Node.js, Java, or npm on your machine  
✅ **Consistent environment** - Same setup for all developers  
✅ **Isolated** - Won't conflict with other projects  
✅ **Quick setup** - Automatic dependency installation  

## Requirements

1. **Docker** - Install on your host system
2. **VS Code** - With the "Dev Containers" extension

## Setup Instructions

### 1. Install Docker

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install docker.io docker-compose

# Add your user to docker group (to run without sudo)
sudo usermod -aG docker $USER

# Log out and back in, or run:
newgrp docker

# Test Docker
docker --version
docker run hello-world
```

### 2. Install Dev Containers Extension

In VS Code:
1. Open Extensions (Ctrl+Shift+X)
2. Search for "Dev Containers"
3. Install the official Microsoft extension (`ms-vscode-remote.remote-containers`)

### 3. Open in Container

**Method 1: From VS Code**
1. Open this folder in VS Code
2. VS Code will detect `.devcontainer/devcontainer.json`
3. Click the popup: "Reopen in Container"

**Method 2: Command Palette**
1. Press `Ctrl+Shift+P`
2. Type: `Dev Containers: Reopen in Container`
3. Select it

**Method 3: From Remote Indicator**
1. Click the green icon in bottom-left corner
2. Select "Reopen in Container"

### 4. Wait for Setup

The first time:
- Docker will pull the base image (~500MB-1GB)
- Container will be built
- `npm install` will run automatically
- Takes 2-5 minutes depending on internet speed

Subsequent times: Opens in seconds!

## What's Included in the Container

### Pre-installed Software
- **Node.js 20.x** - JavaScript runtime
- **npm** - Package manager
- **TypeScript** - Installed via npm
- **Java 17** - For Soar Language Server
- **Gradle** - For building Java projects
- **Git** - Version control

### VS Code Extensions (Auto-installed)
- **ESLint** - Code linting
- **TypeScript** - Enhanced TypeScript support

### Auto-configured
- Terminal defaults to bash
- All npm dependencies installed
- TypeScript ready to compile
- Extension ready to debug (F5)

## Using the DevContainer

### Compile the Extension

```bash
# Inside the container terminal
npm run compile

# Or watch mode
npm run watch
```

### Debug the Extension

Just press `F5` - it works exactly the same as local development!

### Run Tests

```bash
npm test
```

### Terminal Access

The integrated terminal in VS Code automatically runs inside the container. All commands run in the containerized environment.

### File System

Your workspace files are mounted into the container, so:
- ✅ Changes you make are saved on your host
- ✅ Git commits work normally
- ✅ Files persist when container stops

## Container Configuration

The configuration is in `.devcontainer/devcontainer.json`:

```json
{
  "name": "Soar VS Code Extension",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:1-20-bullseye",
  "features": {
    "ghcr.io/devcontainers/features/java:1": {
      "version": "17",
      "installGradle": "true"
    }
  },
  "postCreateCommand": "npm install",
  "remoteUser": "node"
}
```

### Customizing the Container

You can modify `.devcontainer/devcontainer.json` to:
- Add more VS Code extensions
- Install additional tools
- Change Node.js version
- Add environment variables
- Mount additional volumes

## Common Tasks

### Rebuild Container

If you modify `.devcontainer/devcontainer.json`:

1. Press `Ctrl+Shift+P`
2. Type: `Dev Containers: Rebuild Container`
3. Select it

### Exit Container

1. Press `Ctrl+Shift+P`
2. Type: `Dev Containers: Reopen Folder Locally`
3. Or just close VS Code

### Access Container Shell

The integrated terminal is already inside the container, but you can also:

```bash
# From host system
docker exec -it <container-name> bash

# Find container name
docker ps
```

### View Container Logs

```bash
# From host
docker logs <container-name>
```

## Benefits for This Project

### For Development
- ✅ Node.js 20 pre-installed
- ✅ All npm dependencies ready
- ✅ TypeScript compiles immediately
- ✅ ESLint works out of the box

### For Language Server (Phase 3)
- ✅ Java 17 ready for running Soar Language Server
- ✅ Gradle available for building the server
- ✅ No need to install Java on host

### For Collaboration
- ✅ Team members get identical environment
- ✅ "Works on my machine" problems eliminated
- ✅ Easy onboarding for new developers

## Troubleshooting

### Container Won't Start

**Check Docker is running:**
```bash
docker ps
```

**Check Docker permissions:**
```bash
groups | grep docker
```
If docker group is missing, run:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Extension Not Installed

Make sure you have the "Dev Containers" extension:
- Extension ID: `ms-vscode-remote.remote-containers`
- Check: Extensions → Installed

### Slow Performance

**On Linux:** Should be native speed

**On Windows/Mac:** Docker Desktop may use a VM
- Allocate more resources in Docker Desktop settings
- Consider WSL2 on Windows for better performance

### npm install Fails

Rebuild the container:
```bash
# In Command Palette
Dev Containers: Rebuild Container
```

### Port Forwarding

If you need to access services from host:

1. Edit `.devcontainer/devcontainer.json`
2. Add ports to `forwardPorts`:
```json
"forwardPorts": [3000, 8080]
```
3. Rebuild container

## Advanced Usage

### Dockerfile Option

Instead of using a pre-built image, you can create a custom Dockerfile:

Create `.devcontainer/Dockerfile`:
```dockerfile
FROM node:20-bullseye

# Install additional tools
RUN apt-get update && apt-get install -y \
    git \
    vim \
    && rm -rf /var/lib/apt/lists/*

# Install Java for Language Server
RUN apt-get update && apt-get install -y openjdk-17-jdk gradle
```

Update `devcontainer.json`:
```json
{
  "name": "Soar VS Code Extension",
  "build": {
    "dockerfile": "Dockerfile"
  },
  ...
}
```

### Docker Compose Option

For more complex setups, use `docker-compose.yml`:

Create `.devcontainer/docker-compose.yml`:
```yaml
version: '3.8'
services:
  app:
    image: mcr.microsoft.com/devcontainers/typescript-node:1-20-bullseye
    volumes:
      - ..:/workspace:cached
    command: sleep infinity
```

Update `devcontainer.json`:
```json
{
  "name": "Soar VS Code Extension",
  "dockerComposeFile": "docker-compose.yml",
  "service": "app",
  "workspaceFolder": "/workspace",
  ...
}
```

## Resources

- [VS Code DevContainers Documentation](https://code.visualstudio.com/docs/devcontainers/containers)
- [DevContainer Specification](https://containers.dev/)
- [Available Features](https://containers.dev/features)
- [Example DevContainers](https://github.com/devcontainers/templates)

## Summary

With the DevContainer setup:

1. ✅ **Install Docker** (one-time, on host)
2. ✅ **Install Dev Containers extension** (one-time, in VS Code)
3. ✅ **Reopen in Container** (automatic dependency installation)
4. ✅ **Start developing!** (press F5 to test extension)

No Node.js, npm, or Java installation needed on your host system! 🎉
