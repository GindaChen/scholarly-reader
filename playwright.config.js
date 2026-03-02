const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 30000,
    use: {
        headless: true,
        baseURL: 'http://localhost:3003',
    },
    webServer: {
        command: 'node server.js',
        port: 3003,
        reuseExistingServer: true,
    },
});
