const fs = require('fs');
const path = require('path');
const { 
    scanDirectory, 
    loadLocalEpisodes, 
    extractEpisodeNumber, 
    detectSeason, 
    sanitizeFileName, 
    getAnimeId, 
    fetchEpisodes, 
    fetchFromBackup, 
    delay 
} = require('./anime_utils');

const TARGET_DIR = process.argv[2];
const RAW_FOLDER_SELECTION = process.argv[3] || path.basename(TARGET_DIR || ''); 
const USER_SEARCH_NAME = process.argv[4]; 

const DRY_RUN = false; 

const folderParts = RAW_FOLDER_SELECTION.split(/[\/\\]/);
const ROOT_SHOW_NAME = folderParts[0]; 

async function run() {
    console.log(`=============================================`);
    console.log(`Target: ${TARGET_DIR}`);
    console.log(`Mode:   ${DRY_RUN ? 'DRY RUN (Safe)' : 'PRODUCTION (DANGER)'}`);
    console.log(`=============================================`);

    let episodeDictionary = loadLocalEpisodes(TARGET_DIR);

    if (!episodeDictionary) {
        const cleanSearchName = USER_SEARCH_NAME || ROOT_SHOW_NAME.replace(/Season \d+/i, '').trim();
        const malId = await getAnimeId(cleanSearchName);
        
        if (malId) {
            episodeDictionary = await fetchEpisodes(malId);
        }

        if (!episodeDictionary || Object.keys(episodeDictionary).length === 0) {
            episodeDictionary = await fetchFromBackup(cleanSearchName);
        }
    }

    if (!episodeDictionary || Object.keys(episodeDictionary).length === 0) {
        console.log("❌ Could not get episode data from primary or backup databases. Aborting.");
        return;
    }

    const allFiles = scanDirectory(TARGET_DIR);
    let successCount = 0;
    const safeBaseName = sanitizeFileName(ROOT_SHOW_NAME);

    console.log(`\nRenaming files...`);
    for (const fullPath of allFiles) {
        const fileName = path.basename(fullPath);
        const parentDir = path.dirname(fullPath);
        const ext = path.extname(fileName);
        
        const epNum = extractEpisodeNumber(fileName);
        if (epNum === null) continue;
        if (!episodeDictionary[epNum]) continue;

        const epData = episodeDictionary[epNum];
        const title = typeof epData === 'object' ? epData.title : epData;
        
        const seasonNum = detectSeason(fullPath);
        const paddedSeason = seasonNum.toString().padStart(2, '0');
        const paddedEp = epNum.toString().padStart(2, '0');
        const safeTitle = sanitizeFileName(title);
        
        const newFileName = `${safeBaseName} - S${paddedSeason}EP${paddedEp} - ${safeTitle}${ext}`;
        const newFullPath = path.join(parentDir, newFileName);

        if (fileName === newFileName) continue;

        // FIX: Prevent silent file overwriting if target already exists
        if (fs.existsSync(newFullPath)) {
            console.log(`⚠️ Skipped (Target file already exists): ${newFileName}`);
            continue;
        }

        if (DRY_RUN) {
            console.log(`[PREVIEW] ${fileName}  ➡️  ${newFileName}`);
        } else {
            try {
                fs.renameSync(fullPath, newFullPath);
                console.log(`✅ Renamed: ${newFileName}`);
            } catch (err) {
                console.error(`❌ Failed: ${fileName} (Error: ${err.message})`);
            }
        }
        successCount++;
    }

    console.log(`\n=============================================`);
    console.log(`Done! Processed ${successCount} files.`);
    console.log(`=============================================`);
}

run();