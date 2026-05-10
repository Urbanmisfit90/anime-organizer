const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURATION
// ==========================================
const TARGET_DIR = 'D:/Anime/One Piece';
const DRY_RUN = false; // KEEP AS TRUE FOR THE FIRST RUN!

// Jikan API info for One Piece
const ONE_PIECE_MAL_ID = 21; 
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. RECURSIVE SCANNER ---
function scanDirectory(directory) {
    let results = [];
    if (!fs.existsSync(directory)) return results;
    
    const files = fs.readdirSync(directory);
    for (const file of files) {
        const fullPath = path.join(directory, file);
        if (fs.statSync(fullPath).isDirectory()) {
            results = results.concat(scanDirectory(fullPath));
        } else {
            results.push(fullPath);
        }
    }
    return results;
}

// --- 2. EXTRACT EPISODE NUMBER ---
function extractEpisodeNumber(fileName) {
    // 1. Matches your exact format "879.1080.mp4" (Starts with a number, then a dot)
    let match = fileName.match(/^(\d{1,4})\./);
    if (match) return parseInt(match[1], 10);

    // 2. Look for standard markers like S01E01, EP01, E01
    match = fileName.match(/(?:s\d{1,2}e|ep|episode|e)\s*(\d{1,4})/i);
    if (match) return parseInt(match[1], 10);

    // 3. Look for the standard anime hyphen format: "One Piece - 01.mkv"
    match = fileName.match(/\-\s*(\d{1,4})\b/);
    if (match) return parseInt(match[1], 10);

    // 4. Fallback: Find any 1-4 digit number that isn't resolution (1080p), color depth (10bit), or codec (x265)
    match = fileName.match(/(?<!\d)(\d{1,4})\b(?!\s*(?:p|bit|x))/i);
    if (match) return parseInt(match[1], 10);

    return null;
}

// --- 3. FETCH ALL TITLES FROM JIKAN (BULLETPROOF PAGINATION) ---
async function fetchAllOnePieceEpisodes() {
    console.log("Downloading One Piece episode titles from MyAnimeList...");
    const episodeDictionary = {};
    let page = 1;

    // We use an infinite loop that only breaks when the API returns an empty page
    while (true) {
        let success = false;
        let attempts = 0;

        // Try up to 5 times per page if the API crashes
        while (!success && attempts < 5) {
            try {
                attempts++;
                const res = await fetch(`https://api.jikan.moe/v4/anime/${ONE_PIECE_MAL_ID}/episodes?page=${page}`);
                
                if (!res.ok) throw new Error(`API returned ${res.status}`);
                
                const data = await res.json();
                
                // --- THE FIX: If there are no episodes on this page, we've reached the end! ---
                if (!data.data || data.data.length === 0) {
                    console.log(`\nSuccessfully loaded ${Object.keys(episodeDictionary).length} episode titles into memory!\n`);
                    return episodeDictionary;
                }
                
                for (const ep of data.data) {
                    const cleanTitle = ep.title.replace(/[<>:"/\\|?*]+/g, '').trim();
                    episodeDictionary[ep.mal_id] = cleanTitle;
                }

                console.log(`Loaded Page ${page} (Episodes ${data.data[0].mal_id} to ${data.data[data.data.length - 1].mal_id})`);
                
                success = true; // Mark as successful to break the retry loop
                page++; // Increment the page manually
                
                await delay(1500); // Wait 1.5 seconds so we don't get rate-limited
                
            } catch (err) {
                console.error(`Attempt ${attempts} failed on page ${page}: ${err.message}. Retrying in 3 seconds...`);
                await delay(3000); 
                
                if (attempts >= 5) {
                    console.error(`FATAL: Could not fetch page ${page}. Aborting API fetch and using what we have.`);
                    console.log(`\nSuccessfully loaded ${Object.keys(episodeDictionary).length} episode titles into memory!\n`);
                    return episodeDictionary;
                }
            }
        }
    }
}

// --- 4. MAIN PROCESS ---
async function run() {
    console.log(`\n=============================================`);
    console.log(` Starting Ultimate One Piece Renamer`);
    console.log(` Target: ${TARGET_DIR}`);
    console.log(` Mode:   ${DRY_RUN ? 'DRY RUN (Safe)' : 'PRODUCTION (DANGER)'}`);
    console.log(`=============================================\n`);

    // 1. Get the dictionary of all 1000+ episodes
    const dictionary = await fetchAllOnePieceEpisodes();
    if (Object.keys(dictionary).length === 0) {
        console.log("Could not get episode data. Aborting.");
        return;
    }

    // 2. Scan your hard drive
    const allFiles = scanDirectory(TARGET_DIR);
    let successCount = 0;

    // 3. Rename them
    for (const fullPath of allFiles) {
        const fileName = path.basename(fullPath);
        const parentDir = path.dirname(fullPath);
        const ext = path.extname(fileName);

        // Find the episode number in the current filename
        const epNum = extractEpisodeNumber(fileName);

        if (epNum !== null && dictionary[epNum]) {
            const title = dictionary[epNum];
            
            const paddedEp = epNum.toString().padStart(2, '0');
            
            // Create the new format: One Piece - EP01 - Title.mkv
            const newFileName = `One Piece - EP${paddedEp} - ${title}${ext}`;
            const newFullPath = path.join(parentDir, newFileName);

            // Skip if it's already perfectly named
            if (fileName === newFileName) continue;

            if (DRY_RUN) {
                console.log(`[DRY RUN] Rename proposed:`);
                console.log(`  From: ${fileName}`);
                console.log(`  To:   ${newFileName}\n`);
            } else {
                try {
                    fs.renameSync(fullPath, newFullPath);
                    console.log(`Renamed: ${newFileName}`);
                } catch (err) {
                    console.error(`Failed to rename ${fileName}:`, err.message);
                }
            }
            successCount++;
        }
    }

    console.log(`\n=============================================`);
    console.log(`Done! Processed ${successCount} files.`);
    if (DRY_RUN && successCount > 0) {
        console.log(`This was a DRY RUN. Change 'const DRY_RUN = false;' at the top to apply changes.`);
    }
    console.log(`=============================================\n`);
}

run();