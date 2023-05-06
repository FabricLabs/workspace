# Fabric Workspace
This is a Git repository containing the standard Fabric workspace.  Included are
various Fabric-related projects as submodules, which allows changes to every 
component to be tracked individually, but also for snapshots of the state of all
projects as a single release.

## Getting Started
```
git clone --recursive git@github.com:FabricProtocol/workspace.git fabric-workspace
```

## Development
### Compiling from Source
```
git clone --recursive git@github.com:FabricProtocol/workspace.git fabric-workspace
cd fabric-workspace
npm i -g
```

Now, run Fabric using: `fabric`

Stay safe & enjoy! 🚢

#### Requirements
- `git`
- `node`

### Updating Submodules
```
git submodule update --recursive
```
