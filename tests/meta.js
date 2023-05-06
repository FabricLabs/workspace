'use strict';

// Testing
const assert = require('assert');

describe('Git Repositories', function () {
  describe('git@github.com:FabricLabs/fabric.git', function () {
    it('exists', function () {
      const link = 'git@github.com:FabricLabs/fabric.git';
      assert.ok(link);
    });
  });
});
