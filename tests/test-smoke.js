/**
 * Smoke test — verify server starts and responds correctly.
 *
 * Usage: node tests/test-smoke.js
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3003;
let serverProc;
let passed = 0;
let failed = 0;

function fetch(urlPath) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        }).on('error', reject);
    });
}

function assert(name, condition) {
    if (condition) {
        console.log(`  ✅ ${name}`);
        passed++;
    } else {
        console.error(`  ❌ ${name}`);
        failed++;
    }
}

async function runTests() {
    console.log('\n🧪 Scholarly Reader — Smoke Tests\n');

    // Start server
    serverProc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
        stdio: 'pipe',
        env: { ...process.env, PORT: String(PORT) },
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        // Test 1: GET / returns HTML
        const home = await fetch('/');
        assert('GET / returns 200', home.status === 200);
        assert('GET / returns HTML', home.body.includes('<!DOCTYPE html>') || home.body.includes('<html'));

        // Test 2: GET /api/docs returns JSON array
        const docs = await fetch('/api/docs');
        assert('GET /api/docs returns 200', docs.status === 200);
        const docList = JSON.parse(docs.body);
        assert('GET /api/docs returns array', Array.isArray(docList));
        assert('GET /api/docs has docs', docList.length > 0);

        // Test 3: GET /api/doc/:id returns content
        if (docList.length > 0) {
            const firstDoc = docList[0];
            const doc = await fetch(`/api/doc/${firstDoc.id}`);
            assert(`GET /api/doc/${firstDoc.id} returns 200`, doc.status === 200);
        }
    } catch (err) {
        console.error('  ❌ Test error:', err.message);
        failed++;
    }

    // Cleanup
    serverProc.kill();

    console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
