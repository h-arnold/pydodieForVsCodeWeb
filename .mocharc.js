/**
 * Test configuration for Mocha
 */

module.exports = {
  extension: ['ts'],
  spec: 'test/**/*.test.ts',
  require: 'ts-node/register',
  timeout: 5000,
  color: true,
  reporter: 'spec',
};
