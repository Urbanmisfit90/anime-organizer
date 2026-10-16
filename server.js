const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 2468;
const BASE_DIR = 'D:/Anime';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/folders', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        if (!fs.existsSync(BASE_DIR)) return res.json({});
        let libraryStructure = {};

        const mainFolders = fs.readdirSync(BASE_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const show of mainFolders) {
            const showPath = path.join(BASE_DIR, show);
            try {
                const subfolders = fs.readdirSync(showPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                
                libraryStructure[show] = subfolders;
            } catch (subErr) {
                libraryStructure[show] = []; 
            }
        }

        res.json(libraryStructure);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/run-script', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const folderName = req.query.folder;
    const searchName = req.query.searchName || ''; 

    if (!folderName) {
        res.write(`data: ERROR: No folder specified.\n\n`);
        return res.end();
    }

    const targetPath = path.join(BASE_DIR, folderName);
    const child = spawn('node', ['universal_renamer.js', targetPath, folderName, searchName]);

    // FIX: Kill child process if browser client disconnects early
    req.on('close', () => {
        if (!child.killed) child.kill();
    });

    child.stdout.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) res.write(`data: ${line.trim()}\n\n`);
    });
    child.stderr.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) res.write(`data: ERROR: ${line.trim()}\n\n`);
    });
    child.on('close', () => { res.write(`data: [PROCESS_COMPLETE]\n\n`); res.end(); });
});

app.get('/api/missing-episodes', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const targetFolder = req.query.folder;
    const searchName = req.query.searchName || ''; 

    if (!targetFolder) {
        res.write(`data: ERROR: Missing folder.\n\n`);
        return res.end();
    }

    const targetPath = path.join(BASE_DIR, targetFolder);
    const child = spawn('node', ['find_missing_anime.js', targetPath, targetFolder, searchName]);

    // FIX: Kill child process if browser client disconnects early
    req.on('close', () => {
        if (!child.killed) child.kill();
    });

    child.stdout.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) res.write(`data: ${line.trim()}\n\n`);
    });
    child.stderr.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) res.write(`data: ERROR: ${line.trim()}\n\n`);
    });
    child.on('close', () => { res.write(`data: [PROCESS_COMPLETE]\n\n`); res.end(); });
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});