const fs = require('fs');
const path = require('path');

const TARGET_DIR = process.argv[2];
const RAW_FOLDER_SELECTION = process.argv[3]; // e.g., "Frieren/Season II"
const DRY_RUN = false; // Change back to true if you want to test safely!

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- EXTRACT ROOT SHOW NAME ---
// This splits "Frieren/Season II" and grabs just "Frieren"
const folderParts = RAW_FOLDER_SELECTION.split(/[\/\\]/);
const ROOT_SHOW_NAME = folderParts[0]; 

function scanDirectory(directory) {
    let results = [];
    if (!fs.existsSync(directory)) return results;
    const files = fs.readdirSync(directory);
    for (const file of files) {
        const fullPath = path.join(directory, file);
        if (!fs.statSync(fullPath).isDirectory()) {
            results.push(fullPath);
        }
    }
    return results;
}

function extractEpisodeNumber(fileName) {
    let match = fileName.match(/(?:s\d{1,2}e|ep|episode|e)\s*(\d{1,4})/i);
    if (match) return parseInt(match[1], 10);
    match = fileName.match(/\-\s*(\d{1,4})\b/);
    if (match) return parseInt(match[1], 10);
    match = fileName.match(/^(\d{1,4})\./); 
    if (match) return parseInt(match[1], 10);
    match = fileName.match(/(?<!\d)(\d{2,4})\b(?!\s*(?:p|bit|x))/i); 
    if (match) return parseInt(match[1], 10);
    return null;
}

async function getAnimeId(showName) {
    console.log(`\n🔍 Searching MyAnimeList for "${showName}"...`);
    try {
        const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(showName)}&order_by=members&sort=desc&limit=1`);
        if (!res.ok) throw new Error(`API Error ${res.status}`);
        const data = await res.json();
        if (!data.data || data.data.length === 0) return null;
        
        console.log(`✅ Found: ${data.data[0].title} (MAL ID: ${data.data[0].mal_id})`);
        return data.data[0].mal_id;
    } catch (err) {
        console.error(`❌ Search failed:`, err.message);
        return null;
    }
}

async function fetchEpisodes(malId) {
    console.log(`🌐 Downloading episode titles...`);
    const episodeDictionary = {};
    let page = 1;

    while (true) {
        let success = false;
        let attempts = 0;
        while (!success && attempts < 5) {
            try {
                attempts++;
                const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`);
                if (!res.ok) throw new Error(`API returned ${res.status}`);
                const data = await res.json();
                
                if (!data.data || data.data.length === 0) return episodeDictionary;
                
                for (const ep of data.data) {
                    const cleanTitle = ep.title.replace(/[<>:"/\\|?*]+/g, '').trim();
                    episodeDictionary[ep.mal_id] = cleanTitle;
                }
                console.log(`Loaded Page ${page}`);
                success = true;
                page++;
                await delay(1500); 
            } catch (err) {
                console.error(`⚠️ Attempt ${attempts} failed. Retrying...`);
                await delay(3000); 
                if (attempts >= 5) return episodeDictionary;
            }
        }
    }
}

async function run() {
    console.log(`=============================================`);
    console.log(`Target: ${TARGET_DIR}`);
    console.log(`Mode:   ${DRY_RUN ? 'DRY RUN (Safe)' : 'PRODUCTION (DANGER)'}`);
    console.log(`=============================================`);

    // Clean up the root show name just in case it has weird tags
    const cleanSearchName = ROOT_SHOW_NAME.replace(/Season \d+/i, '').trim();
    
    const malId = await getAnimeId(cleanSearchName);
    if (!malId) {
        console.log(`❌ Could not find the show on MyAnimeList. Aborting.`);
        return;
    }

    const dictionary = await fetchEpisodes(malId);
    if (Object.keys(dictionary).length === 0) {
        console.log(`❌ Could not get episode data. Aborting.`);
        return;
    }

    const allFiles = scanDirectory(TARGET_DIR);
    let successCount = 0;

    // Create a perfectly safe base name for Windows
    const safeBaseName = ROOT_SHOW_NAME.replace(/[<>:"/\\|?*]+/g, '').trim();

    console.log(`\nRenaming files...`);
    for (const fullPath of allFiles) {
        const fileName = path.basename(fullPath);
        const parentDir = path.dirname(fullPath);
        const ext = path.extname(fileName);
        const epNum = extractEpisodeNumber(fileName);

        if (epNum !== null && dictionary[epNum]) {
            const title = dictionary[epNum];
            const paddedEp = epNum.toString().padStart(2, '0');
            
            // Format: Frieren Beyond Journey's End - EP03 - Title.mkv
            const newFileName = `${safeBaseName} - EP${paddedEp} - ${title}${ext}`;
            const newFullPath = path.join(parentDir, newFileName);

            if (fileName === newFileName) continue;

            if (DRY_RUN) {
                console.log(`[DRY RUN] ${fileName}  ➡️  ${newFileName}`);
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
    }

    console.log(`\n=============================================`);
    console.log(`Done! Processed ${successCount} files.`);
    console.log(`=============================================`);
}

run();