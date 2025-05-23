module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: './babel.config.json' }]
  },
  testMatch: ['**/test/**/*.test.js'],
  moduleFileExtensions: ['js', 'json', 'node'],
  testPathIgnorePatterns: ['/dist/', '/node_modules/']
}
