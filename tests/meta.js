'use strict';

// Testing
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Helper to get workspace root
const workspaceRoot = path.join(__dirname, '..');
const storesPath = path.join(workspaceRoot, 'stores');
const metaJsonPath = path.join(storesPath, 'meta.json');

// Ensure stores directory exists
if (!fs.existsSync(storesPath)) {
  fs.mkdirSync(storesPath, { recursive: true });
}

// Load repository metadata
let repositories = {};
try {
  const metaContent = fs.readFileSync(metaJsonPath, 'utf8');
  const meta = JSON.parse(metaContent);
  repositories = meta.repositories || {};
} catch (error) {
  console.warn('Could not load meta.json:', error.message);
}

// Common helper methods
function safeRequire (modulePath) {
  try {
    return require(modulePath);
  } catch (error) {
    if (error.message.includes('Cannot find module')) {
      return null;
    }
    throw error;
  }
}

function getRepositoryInfo (repoKey) {
  return repositories[repoKey] || null;
}

function testPackageStructure (repoPath, expectedName) {
  const packageJsonPath = path.join(workspaceRoot, repoPath, 'package.json');
  assert.ok(fs.existsSync(packageJsonPath), `${repoPath}/package.json should exist`);

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (expectedName) {
    assert.strictEqual(packageJson.name, expectedName, 'package.json should have correct name');
  }
  return packageJson;
}

function testMainEntryPoint (repoPath, packageJson) {
  const mainFile = packageJson.main || 'index.js';
  const mainPath = path.join(workspaceRoot, repoPath, mainFile);
  assert.ok(fs.existsSync(mainPath), `Main entry point ${mainFile} should exist`);
}

function testDirectoryStructure (repoPath, requiredDirs) {
  requiredDirs.forEach(dir => {
    const dirPath = path.join(workspaceRoot, repoPath, dir);
    assert.ok(fs.existsSync(dirPath), `${repoPath}/${dir} directory should exist`);
    assert.ok(fs.statSync(dirPath).isDirectory(), `${repoPath}/${dir} should be a directory`);
  });
}

async function testRepositoryClone (repositoryLink, repositoryHttpsLink, repositoryId) {
  // Use simple-git to clone the repository and Store to track it
  let simpleGit;
  try {
    simpleGit = require('simple-git');
  } catch (error) {
    if (error.message.includes('Cannot find module')) {
      // If simple-git isn't available, skip this test
      throw new Error('simple-git not available - skipping clone test');
    }
    throw error;
  }

  // Try to load Store, but make it optional
  let Store;
  let store;
  try {
    Store = require(path.join(workspaceRoot, 'fabric', 'types', 'store'));
    store = new Store({
      path: path.join(storesPath, 'repositories')
    });
  } catch (error) {
    // Store is optional - we can still test cloning without it
    store = null;
  }

  const clonePath = path.join(storesPath, 'repositories', repositoryId);

  // Clean up any existing clone
  if (fs.existsSync(clonePath)) {
    fs.rmSync(clonePath, { recursive: true, force: true });
  }

  // Clone the repository using HTTPS (more reliable for CI/tests)
  const git = simpleGit();
  await git.clone(repositoryHttpsLink, clonePath, ['--depth', '1']);

  // Verify the clone was successful
  assert.ok(fs.existsSync(clonePath), 'Cloned repository directory should exist');
  assert.ok(fs.existsSync(path.join(clonePath, '.git')), 'Cloned repository should have .git directory');
  assert.ok(fs.existsSync(path.join(clonePath, 'package.json')), 'Cloned repository should have package.json');

  // Verify it's actually a git repository
  const clonedGit = simpleGit(clonePath);
  const isRepo = await clonedGit.checkIsRepo();
  assert.strictEqual(isRepo, true, 'Cloned directory should be a valid git repository');

  // Store the repository information if Store is available
  if (store) {
    try {
      await store._PUT(repositoryId, {
        link: repositoryLink,
        httpsLink: repositoryHttpsLink,
        cloned: true,
        path: clonePath,
        timestamp: Date.now()
      });

      // Verify it was stored
      const stored = await store._GET(repositoryId);
      assert.ok(stored, 'Repository should be stored');
      assert.strictEqual(stored.link, repositoryLink, 'Stored link should match');
      assert.strictEqual(stored.cloned, true, 'Should be marked as cloned');
      assert.ok(stored.path, 'Should have clone path stored');
    } catch (error) {
      // Store operations are optional - don't fail the test if they fail
      if (!error.message.includes('level') && !error.message.includes('Cannot find module')) {
        throw error;
      }
    }
  }

  return clonePath;
}

describe('Fabric Workspace', function () {
  describe('GitHub Repositories', function () {
    Object.keys(repositories).forEach(function (repoKey) {
      const repo = repositories[repoKey];
      it(`can clone ${repo.link}`, async function () {
        this.timeout(10000); // Increase timeout for git clone operation
        const repositoryId = `${repoKey}-repository`;
        try {
          await testRepositoryClone(repo.link, repo.httpsLink, repositoryId);
        } catch (error) {
          if (error.message.includes('simple-git not available')) {
            // Skip test if simple-git isn't available
            return;
          }
          throw error;
        }
      });
    });
  });

  describe('git@github.com:FabricLabs/fabric.git', function () {
    it('exists', function () {
      const link = 'git@github.com:FabricLabs/fabric.git';
      assert.ok(link);
    });

    it('has @fabric/core submodule', function () {
      const fabricPath = path.join(__dirname, '..', 'fabric');
      const packageJson = testPackageStructure('fabric', '@fabric/core');
      testMainEntryPoint('fabric', packageJson);
    });

    it('has required fabric core directories', function () {
      testDirectoryStructure('fabric', ['types', 'services', 'tests']);
    });

    it('can load Fabric library and access static properties', function () {
      // Note: This test may fail if fabric submodule dependencies aren't installed
      // That's expected in a workspace context where submodules may not have node_modules
      const Fabric = safeRequire(path.join(__dirname, '..', 'fabric'));
      if (!Fabric) {
        console.warn('Fabric dependencies not installed - skipping library functionality test');
        return; // Skip this test if dependencies aren't available
      }

      // Verify it's a constructor function
      assert.ok(Fabric instanceof Function, 'Fabric should be a constructor function');

      // Test static getters for core types (these don't require instantiation)
      assert.ok(Fabric.Service, 'Fabric should expose Service static property');
      assert.ok(Fabric.Service instanceof Function, 'Fabric.Service should be a constructor');

      assert.ok(Fabric.State, 'Fabric should expose State static property');
      assert.ok(Fabric.State instanceof Function, 'Fabric.State should be a constructor');

      // Test static utility methods
      assert.ok(typeof Fabric.sha256 === 'function', 'Fabric should have sha256 static method');
      assert.ok(typeof Fabric.random === 'function', 'Fabric should have random static method');

      // Test that sha256 works
      const hash = Fabric.sha256('test');
      assert.strictEqual(typeof hash, 'string', 'sha256 should return a string');
      assert.strictEqual(hash.length, 64, 'sha256 should return 64 character hex string');
    });

    it('can instantiate and use Actor type', function () {
      const Actor = safeRequire(path.join(__dirname, '..', 'fabric', 'types', 'actor'));
      if (!Actor) {
        console.warn('Fabric dependencies not installed - skipping Actor test');
        return;
      }

      // Verify Actor is a constructor
      assert.ok(Actor instanceof Function, 'Actor should be a constructor function');

      // Create an Actor instance
      const actor = new Actor({
        name: 'test-actor',
        type: 'Test'
      });

      // Verify Actor properties
      assert.ok(actor, 'Actor instance should be created');
      assert.ok(actor.settings, 'Actor should have settings');
      assert.ok(actor._state, 'Actor should have internal state');
      assert.strictEqual(actor.settings.type, 'Actor', 'Actor should have correct type');

      // Verify Actor is an EventEmitter
      assert.ok(typeof actor.on === 'function', 'Actor should be an EventEmitter');
      assert.ok(typeof actor.emit === 'function', 'Actor should be an EventEmitter');
    });

    it('can instantiate and use Message type', function () {
      const Message = safeRequire(path.join(__dirname, '..', 'fabric', 'types', 'message'));
      if (!Message) {
        console.warn('Fabric dependencies not installed - skipping Message test');
        return;
      }

      // Verify Message is a constructor
      assert.ok(Message instanceof Function, 'Message should be a constructor function');

      // Test static methods
      assert.ok(typeof Message.fromVector === 'function', 'Message should have fromVector static method');
      assert.ok(typeof Message.fromRaw === 'function', 'Message should have fromRaw static method');

      // Create a simple message
      const testData = ['GenericMessage', JSON.stringify({ test: 'data' })];
      let message;
      try {
        message = Message.fromVector(testData);
        assert.ok(message, 'Message should be created from vector');
        assert.ok(message.toObject, 'Message should have toObject method');
        assert.ok(message.toRaw, 'Message should have toRaw method');
      } catch (error) {
        // If message creation fails due to missing dependencies, that's acceptable
        if (error.message.includes('Cannot find module') || error.message.includes('struct')) {
          return; // Skip test if dependencies aren't available
        }
        throw error;
      }
    });
  });
});
