/**
 * Sample test to validate testing infrastructure
 */

import { strict as assert } from 'assert';

describe('Extension Test Suite', () => {
  it('should pass a basic test', () => {
    assert.equal(1 + 1, 2);
  });

  it('should handle async operations', async () => {
    const result = await Promise.resolve(42);
    assert.equal(result, 42);
  });

  describe('String operations', () => {
    it('should concatenate strings', () => {
      const result = 'Hello' + ' ' + 'World';
      assert.equal(result, 'Hello World');
    });
  });
});
