/**
 * Scholarly Reader — Electron Main Process
 *
 * Wraps the Express server in a native desktop window.
 * This gives us proper keyboard shortcuts without browser conflicts.
 */

const { app, BrowserWindow, Menu, globalShortcut } = require('electron');
const path = require('path');

// Start the Express server
require('./server.js');

const PORT = process.env.SCHOLARLY_PORT || 3003;

function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 16 },
        backgroundColor: '#0d1117',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    win.loadURL(`http://localhost:${PORT}`);

    // Open DevTools in dev mode
    if (process.argv.includes('--dev')) {
        win.webContents.openDevTools({ mode: 'detach' });
    }

    // Build native menu with proper accelerators
    const template = [
        {
            label: 'Scholarly Reader',
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
            ],
        },
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    click: () => win.webContents.executeJavaScript(
                        `document.getElementById('undo-btn')?.click()`
                    ),
                },
                {
                    label: 'Redo',
                    accelerator: 'CmdOrCtrl+Shift+Z',
                    click: () => win.webContents.executeJavaScript(
                        `document.getElementById('redo-btn')?.click()`
                    ),
                },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
            ],
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Focus Mode',
                    accelerator: 'CmdOrCtrl+Shift+F',
                    click: () => win.webContents.executeJavaScript(
                        `document.body.classList.toggle('focus-mode');
                         try { localStorage.setItem('scholarly-reader-focus', document.body.classList.contains('focus-mode')); } catch {}`
                    ),
                },
                {
                    label: 'Eraser Mode',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => win.webContents.executeJavaScript(
                        `document.getElementById('eraser-btn')?.click()`
                    ),
                },
                {
                    label: 'Table of Contents',
                    accelerator: 'CmdOrCtrl+T',
                    click: () => win.webContents.executeJavaScript(
                        `document.getElementById('toc-trigger')?.click()`
                    ),
                },
                { type: 'separator' },
                {
                    label: 'Variables Panel',
                    accelerator: 'CmdOrCtrl+1',
                    click: () => win.webContents.executeJavaScript(
                        `document.getElementById('vars-toggle')?.click()`
                    ),
                },
                {
                    label: 'References Panel',
                    accelerator: 'CmdOrCtrl+2',
                    click: () => win.webContents.executeJavaScript(
                        `document.getElementById('refs-toggle')?.click()`
                    ),
                },
                {
                    label: 'Notes Panel',
                    accelerator: 'CmdOrCtrl+3',
                    click: () => win.webContents.executeJavaScript(
                        `document.getElementById('notes-toggle')?.click()`
                    ),
                },
                { type: 'separator' },
                {
                    label: 'Keyboard Shortcuts',
                    accelerator: 'CmdOrCtrl+/',
                    click: () => win.webContents.executeJavaScript(
                        `document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))`
                    ),
                },
                { type: 'separator' },
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                { type: 'separator' },
                { role: 'front' },
            ],
        },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
