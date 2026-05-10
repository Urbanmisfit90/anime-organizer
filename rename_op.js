const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURATION
// ==========================================
const TARGET_DIR = 'D:/Anime/One Piece'; 
const DRY_RUN = false; 

// --- 1. RECURSIVE SCANNER ---
// This ensures we check inside every subfolder (Season 1, Season 2, etc.)
function scanDirectory(directory) {
    let results = [];
    const files = fs.readdirSync(directory);
    
    for (const file of files) {
        const fullPath = path.join(directory, file);
        if (fs.statSync(fullPath).isDirectory()) {
            results = results.concat(scanDirectory(fullPath)); // Dig into the subfolder
        } else {
            results.push(fullPath); // It's a file, save it
        }
    }
    return results;
}

function renameOnePiece() {
    console.log(`\n=============================================`);
    console.log(` Starting Targeted Renamer: One Piece`);
    console.log(` Target: ${TARGET_DIR}`);
    console.log(` Mode:   ${DRY_RUN ? 'DRY RUN (Safe)' : 'PRODUCTION (DANGER)'}`);
    console.log(`=============================================\n`);

    if (!fs.existsSync(TARGET_DIR)) {
        console.log(`❌ Error: Could not find the folder at ${TARGET_DIR}`);
        return;
    }

    const allFiles = scanDirectory(TARGET_DIR);
    let matchCount = 0;

    // --- 2. FORGIVING REGEX ---
    // Matches S01E, S1E, S01 E, S02E, etc., followed by 2-4 digits.
    const seasonEpRegex = /S\d{1,2}\s*E?\s*(\d{2,4})/i;

    for (const fullPath of allFiles) {
        const fileName = path.basename(fullPath);
        const parentDir = path.dirname(fullPath);

        if (seasonEpRegex.test(fileName)) {
            matchCount++;
            
            // Swap whatever Season/Ep combo it found for "EP" and keep the numbers
            const newFileName = fileName.replace(seasonEpRegex, "EP$1");
            const newFullPath = path.join(parentDir, newFileName);

            if (DRY_RUN) {
                console.log(`[DRY RUN] Rename proposed:`);
                console.log(`  From: ${fileName}`);
                console.log(`  To:   ${newFileName}\n`);
            } else {
                try {
                    fs.renameSync(fullPath, newFullPath);
                    console.log(`✅ Renamed: ${newFileName}`);
                } catch (err) {
                    console.error(`❌ Failed to rename ${fileName}:`, err.message);
                }
            }
        }
    }

    console.log(`\n=============================================`);
    console.log(`Done! Found and processed ${matchCount} files.`);
    if (DRY_RUN && matchCount > 0) {
        console.log(`⚠️ This was a DRY RUN. Change 'const DRY_RUN = false;' at the top to apply changes.`);
    }
    console.log(`=============================================\n`);
}

renameOnePiece();