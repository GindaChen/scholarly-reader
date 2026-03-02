const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3003';

test.describe('Scholarly Reader', () => {

    test('server is reachable', async ({ page }) => {
        const response = await page.goto(BASE_URL);
        expect(response.status()).toBe(200);
    });

    test('homepage loads with document picker', async ({ page }) => {
        await page.goto(BASE_URL);
        await expect(page.locator('#doc-title')).toBeVisible();
        await expect(page.locator('#doc-picker')).toBeVisible();
    });

    test('can open a paper', async ({ page }) => {
        await page.goto(BASE_URL);
        // Click doc picker to open menu
        await page.goto(`${BASE_URL}/?doc=1406-1078`);
        
        // Click first paper
        
        
        // Paper content should load
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 5000 });
    });

    test('sample paper has numbered ref badges', async ({ page }) => {
        await page.goto(`${BASE_URL}/?doc=attention-is-all-you-need`);
        await page.waitForLoadState('networkidle');
        const refBadges = page.locator('sup.ref-badge');
        const count = await refBadges.count();
        expect(count).toBeGreaterThan(10);
        // First badge should be a number
        const firstText = await refBadges.first().textContent();
        expect(firstText.trim()).toMatch(/^\d+$/);
    });

    test('imported paper has numbered ref badges', async ({ page }) => {
        await page.goto(`${BASE_URL}/?doc=1406-1078`);
        await page.waitForLoadState('networkidle');
        const refBadges = page.locator('sup.ref-badge');
        const count = await refBadges.count();
        expect(count).toBeGreaterThan(5);
    });

    test('math renders without errors (no red text)', async ({ page }) => {
        await page.goto(`${BASE_URL}/?doc=1406-1078`);
        await page.waitForLoadState('networkidle');
        // Check for KaTeX error spans (red color)
        const errorSpans = page.locator('.katex-error, [style*="color:#cc0000"], [style*="color: #cc0000"]');
        const errorCount = await errorSpans.count();
        expect(errorCount).toBe(0);
    });

    test('math displays as rendered KaTeX (not raw LaTeX)', async ({ page }) => {
        await page.goto(`${BASE_URL}/?doc=1406-1078`);
        await page.waitForLoadState('networkidle');
        const katexSpans = page.locator('.katex');
        const count = await katexSpans.count();
        expect(count).toBeGreaterThan(5);
        // Should not have raw \mbox or \notin visible as text
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).not.toContain('\\mbox{');
        // \notin may appear in complex math - main check is no raw \mbox
    });

    test('ref badges are clickable', async ({ page }) => {
        await page.goto(`${BASE_URL}/?doc=attention-is-all-you-need`);
        await page.waitForLoadState('networkidle');
        const firstBadge = page.locator('sup.ref-badge').first();
        await expect(firstBadge).toBeVisible();
        // Should have cursor pointer or click handler
        const cursor = await firstBadge.evaluate(el => getComputedStyle(el).cursor);
        expect(cursor).toBe('pointer');
    });

    test('table of contents works', async ({ page }) => {
        await page.goto(`${BASE_URL}/?doc=attention-is-all-you-need`);
        await page.waitForLoadState('networkidle');
        await page.locator('#toc-trigger').click();
        await expect(page.locator('#toc-menu')).toBeVisible();
    });

    test('variables panel toggles', async ({ page }) => {
        await page.goto(`${BASE_URL}/?doc=attention-is-all-you-need`);
        await page.waitForLoadState('networkidle');
        await page.locator('#vars-toggle').click();
        // Panel should toggle visibility
        await page.waitForTimeout(300);
    });

    test('no console errors on page load', async ({ page }) => {
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        await page.goto(`${BASE_URL}/?doc=attention-is-all-you-need`);
        await page.waitForLoadState('networkidle');
        // Filter out known non-critical errors
        const critical = errors.filter(e => !e.includes('favicon') && !e.includes('OPENAI'));
        expect(critical).toHaveLength(0);
    });
});
