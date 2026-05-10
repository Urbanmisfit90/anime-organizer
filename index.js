const fs = require('fs');
const path = require('path');

// ==========================================
// 1. CONFIGURATION
// ==========================================
const TARGET_DIR = 'D:/Anime'; // Set to your target folder or drive root
const DRY_RUN = false; // CHANGE TO 'false' WHEN READY TO ACTUALLY RENAME
const API_DELAY_MS = 1500; // 1.5 second delay between files to respect API limits

const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi'];

// ==========================================
// 2. UTILITY FUNCTIONS
// ==========================================
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function logError(message) {
    const time = new Date().toLocaleTimeString(); 
    fs.appendFileSync('error_log.txt', `[${time}] ${message}\n`);
}

function extractShowTitle(folderName) {
    return folderName
        .replace(/\([^)]*\)/g, '') // Removes (parentheses) and their contents
        .replace(/\[[^\]]*\]/g, '') // Removes [brackets] and their contents
        .replace(/\b(episode|ep)\s*-?\s*\d+\b/gi, '') // Removes "episode 1", "ep-01", etc.
        .replace(/\b(complete|series|seasons?|ovas?|dub|dubbed|sub|subbed|english|uncensored)\b/gi, '') // Removes extra keywords
        .replace(/\d+\s*-\s*\d+/g, '') // Removes ranges like "1-24"
        .replace(/\b\d\s*&\s*\d\b/g, '') // Removes "1 & 2"
        .replace(/[-_.+&]/g, ' ') // Replaces hyphens, underscores, and dots with spaces
        .replace(/\s{2,}/g, ' ') // Cleans up any double spaces left behind
        .trim();
}

function extractEpisodeNumber(fileName) {
    // 1. FIRST PRIORITY: If it already has our clean S01E### format, grab that exact number!
    const strictRegex = /S\d+E(\d+)/i;
    const strictMatch = fileName.match(strictRegex);
    if (strictMatch) return strictMatch[1].padStart(2, '0');

    // 2. STANDARD CHECK: Added \b (word boundary) so it doesn't trigger on the 'e' inside the word 'Movie'
    const episodeRegex = /\b(?:e|ep|episode)\s*(\d{1,4})/i;
    const match = fileName.match(episodeRegex);
    if (match) return match[1].padStart(2, '0');
    
    // 3. FALLBACK CHECK
    const fallbackRegex = /(?<!\d)(\d{2,4})(?!\w*p)/i;
    const fallbackMatch = fileName.match(fallbackRegex);
    return fallbackMatch ? fallbackMatch[1] : "Unknown"; 
}

// ==========================================
// 3. API FUNCTION (Direct Episode Fetch)
// ==========================================
async function getEpisodeTitle(showName, episodeNumber, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await delay(1000 * attempt); 

            // 1. Search for the Show ID
const searchRes = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(showName)}&order_by=members&sort=desc&limit=1`);            
            if (!searchRes.ok) {
                console.log(`   [Attempt ${attempt}] Search API returned status: ${searchRes.status}`);
                continue; 
            }

            const searchData = await searchRes.json();
            if (!searchData.data || searchData.data.length === 0) return null;
            
            const animeId = searchData.data[0].mal_id;
            const officialShowTitle = searchData.data[0].title;

            await delay(1000); 

            // 2. Fetch the EXACT episode directly (Bypassing pagination entirely)
            const epRes = await fetch(`https://api.jikan.moe/v4/anime/${animeId}/episodes/${parseInt(episodeNumber)}`);
            
            if (!epRes.ok) {
                 console.log(`   [Attempt ${attempt}] Episode API returned status: ${epRes.status}`);
                 continue; 
            }

            const epData = await epRes.json();
            
            // If the data object exists, we have our episode
            if (!epData.data) return null;

            return {
                officialShow: officialShowTitle,
                episodeTitle: epData.data.title || "Unknown Episode"
            };

        } catch (error) {
            console.log(`   [Attempt ${attempt}] Network/Fetch Error: ${error.message}`);
            if (attempt === retries) return null; 
        }
    }
    return null;
}

// ==========================================
// 4. DIRECTORY SCANNER
// ==========================================
function scanDirectory(directory) {
    let results = [];
    const files = fs.readdirSync(directory);
    
    for (const file of files) {
        const fullPath = path.join(directory, file);
        if (fs.statSync(fullPath).isDirectory()) {
            results = results.concat(scanDirectory(fullPath));
        } else if (VIDEO_EXTENSIONS.includes(path.extname(fullPath).toLowerCase())) {
            results.push(fullPath);
        }
    }
    return results;
}

// ==========================================
// 5. THE MAIN PROCESS
// ==========================================
async function processLibrary() {
    console.log(`\n=============================================`);
    console.log(` Starting Anime Renamer`);
    console.log(` Target: ${TARGET_DIR}`);
    console.log(` Mode:   ${DRY_RUN ? 'DRY RUN (Safe - No files will be changed)' : 'PRODUCTION (DANGER - Files will be renamed)'}`);
    console.log(`=============================================\n`);

    const videoFiles = scanDirectory(TARGET_DIR);
    console.log(`Found ${videoFiles.length} files. Beginning processing...\n`);

    for (const fullPath of videoFiles) {
        const originalFileName = path.basename(fullPath);
        const parentFolder = path.basename(path.dirname(fullPath));
        const extension = path.extname(fullPath);

// --- SAFETY CHECK: Skip files that are already formatted (BUT re-try 'Unknowns') ---
        if (originalFileName.includes(" - S0") && !originalFileName.includes("Unknown Episode")) {
            console.log(`⏭️ Skipping (Already renamed): ${originalFileName}`);
            continue;
        }

// --- THE GRANDPARENT CHECK (Now with Movies!) ---
        let folderToSearch = parentFolder;
        const lowerFolder = folderToSearch.toLowerCase();
        
        // If the immediate folder is a Season, OVA, Special, or Movie folder, step up one level!
        if (lowerFolder.includes("season") || lowerFolder.includes("ova") || lowerFolder.includes("special") || lowerFolder.includes("movie")) {
            folderToSearch = path.basename(path.dirname(path.dirname(fullPath)));
        }

        const cleanSearchTitle = extractShowTitle(folderToSearch);
        const episodeNum = extractEpisodeNumber(originalFileName);

        // --- ERROR TRIGGER 1: Unknown Episode Number ---
        if (episodeNum === "Unknown") {
            console.log(`⏭️ Skipping (Could not find episode number): ${originalFileName}`);
            logError(`SKIPPED (No Ep Number): ${fullPath}`);
            continue;
        }

        console.log(`Fetching metadata for: ${cleanSearchTitle} - Ep ${episodeNum}...`);
        
        const metadata = await getEpisodeTitle(cleanSearchTitle, episodeNum);
        
        if (metadata) {
            // Clean up the titles for Windows file paths
            const safeEpisodeTitle = metadata.episodeTitle.replace(/[<>:"/\\|?*]+/g, '');
            const safeShowTitle = metadata.officialShow.replace(/[<>:"/\\|?*]+/g, '');

            const newFileName = `${safeShowTitle} - S01E${episodeNum} - ${safeEpisodeTitle}${extension}`;
            const newFullPath = path.join(path.dirname(fullPath), newFileName);

            if (DRY_RUN) {
                console.log(`[DRY RUN] Rename proposed:`);
                console.log(`   From: ${originalFileName}`);
                console.log(`   To:   ${newFileName}\n`);
            } else {
                // --- NEW SAFETY NET FOR EPERM ERRORS ---
                try {
                    fs.renameSync(fullPath, newFullPath);
                    console.log(`✅ Renamed to: ${newFileName}\n`);
                } catch (renameErr) {
                    console.log(`❌ FAILED TO RENAME (File locked or permission denied): ${originalFileName}\n`);
                    logError(`RENAME FAILED: ${fullPath} | Reason: ${renameErr.code}`);
                }
            }
        } else {
            // --- ERROR TRIGGER 2: API Failure ---
            console.log(`❌ Failed to get metadata for: ${originalFileName}\n`);
            logError(`API FAILED: ${fullPath} (Show: ${cleanSearchTitle}, Ep: ${episodeNum})`);
        }

        // Wait before looping to the next file
        await delay(API_DELAY_MS); 
    }
    
    console.log("\n=============================================");
    console.log(" Processing Complete!");
    console.log(" Check 'error_log.txt' for any skipped files.");
    console.log("=============================================\n");
}

// Execute
processLibrary();