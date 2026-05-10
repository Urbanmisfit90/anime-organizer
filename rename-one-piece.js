const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURATION
// ==========================================
const TARGET_DIR = 'D:/Anime/One Piece'; // Double-check this exactly matches your folder name
const DRY_RUN = false; // CHANGE TO 'false' WHEN YOU ARE READY TO RENAME
const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi'];

function renameOnePiece() {
    console.log(`Scanning ${TARGET_DIR} for episodes...\n`);

    if (!fs.existsSync(TARGET_DIR)) {
        console.log(`❌ Error: Could not find folder at ${TARGET_DIR}`);
        return;
    }

    const files = fs.readdirSync(TARGET_DIR);
    let matchCount = 0;

    for (const file of files) {
        const fullPath = path.join(TARGET_DIR, file);
        const ext = path.extname(file).toLowerCase();

        // Skip directories and non-video files
        if (fs.statSync(fullPath).isDirectory() || !VIDEO_EXTENSIONS.includes(ext)) {
            continue;
        }

        // Look for the "S01E" or "S0E" pattern (e.g., S01E01, S01E1071)
        // This regex captures the exact episode numbers into group $1
        const seasonRegex = /S\d+E(\d+)/i;

        if (seasonRegex.test(file)) {
            matchCount++;
            
            // Replaces "S01E01" with "EP01"
            const newFileName = file.replace(seasonRegex, 'EP$1');
            const newFullPath = path.join(TARGET_DIR, newFileName);

            if (DRY_RUN) {
                console.log(`[DRY RUN] Rename proposed:`);
                console.log(`   From: ${file}`);
                console.log(`   To:   ${newFileName}\n`);
            } else {
                // Safety check: Prevent overwriting if a file already exists with the new name
                if (fs.existsSync(newFullPath)) {
                    console.log(`⚠️ Skipped (File already exists): ${newFileName}`);
                    continue;
                }

                try {
                    fs.renameSync(fullPath, newFullPath);
                    console.log(`✅ Renamed to: ${newFileName}`);
                } catch (err) {
                    console.log(`❌ Failed to rename: ${file} | Reason: ${err.message}`);
                }
            }
        }
    }

    console.log(`\n=============================================`);
    console.log(` Finished! Found ${matchCount} files matching the 'S01E' format.`);
    if (DRY_RUN) console.log(` Reminder: DRY_RUN is ON. No files were actually changed.`);
    console.log(`=============================================\n`);
}

// Execute
renameOnePiece();