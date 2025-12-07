#!/bin/bash
cd ~/workspace/fabric && npm link
cd ~/workspace/fabric-http && npm link @fabric/core && npm link
cd ~/workspace/hub.fabric.pub && npm link @fabric/http && npm link

echo "Linked Fabric, Fabric HTTP, and Fabric Hub.  Run `npm link @fabric/hub` in your project."
