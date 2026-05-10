const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 2468;
const BASE_DIR = 'D:/Anime';

app.use(express.static(path.join(__dirname, 'public')));

// Updated Endpoint: Send structured dictionary of Shows -> Subfolders
app.get('/api/folders', (req, res) => {
    try {
        if (!fs.existsSync(BASE_DIR)) {
            return res.json({});
        }

        let libraryStructure = {};

        // 1. Get the main show folders (Level 1)
        const mainFolders = fs.readdirSync(BASE_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const show of mainFolders) {
            const showPath = path.join(BASE_DIR, show);
            try {
                // 2. Look inside the show folder for subfolders (Level 2)
                const subfolders = fs.readdirSync(showPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                
                libraryStructure[show] = subfolders;
            } catch (subErr) {
                libraryStructure[show] = []; // If locked/error, default to empty
            }
        }

        res.json(libraryStructure);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Updated Endpoint: Run script for a specific folder
app.get('/api/run-script', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const folderName = req.query.folder;
    if (!folderName) {
        res.write(`data: ERROR: No folder specified.\n\n`);
        return res.end();
    }

    const targetPath = path.join(BASE_DIR, folderName);
    
    // Pass the path and the folder name into the universal renamer
    const child = spawn('node', ['universal_renamer.js', targetPath, folderName]);

    child.stdout.on('data', (data) => {
        const text = data.toString().trim();
        if (text) res.write(`data: ${text}\n\n`);
    });

    child.stderr.on('data', (data) => {
        const errorText = data.toString().trim();
        if (errorText) res.write(`data: ERROR: ${errorText}\n\n`);
    });

    child.on('close', () => {
        res.write(`data: [PROCESS_COMPLETE]\n\n`);
        res.end();
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});