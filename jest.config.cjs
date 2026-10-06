const { join } = require('node:path');

module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': [
      'babel-jest',
      { configFile: join(__dirname, 'babel.config.json') },
    ],
  },
  testMatch: ['**/test/**/*.test.js'],
  moduleFileExtensions: ['js', 'json', 'node'],
  testPathIgnorePatterns: ['/dist/', '/node_modules/'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageReporters: ['text', 'text-summary'],
};
