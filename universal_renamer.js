const fs = require('fs');
const path = require('path');

const TARGET_DIR = process.argv[2];
const RAW_FOLDER_SELECTION = process.argv[3]; 
const USER_SEARCH_NAME = process.argv[4]; 

const DRY_RUN = false; 

const folderParts = RAW_FOLDER_SELECTION.split(/[\/\\]/);
const ROOT_SHOW_NAME = folderParts[0]; 

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function scanDirectory(directory) {
    let results = [];
    if (!fs.existsSync(directory)) return results;
    const files = fs.readdirSync(directory);
    for (const file of files) {
        const fullPath = path.join(directory, file);
        if (fs.statSync(fullPath).isDirectory()) {
            results = results.concat(scanDirectory(fullPath));
        } else {
            if (file.match(/\.(mp4|mkv|avi|m4v)$/i)) results.push(fullPath);
        }
    }
    return results;
}

function extractEpisodeNumber(fileName) {
    let match = fileName.match(/(?:s\d{1,2}e|ep|episode|e)[\s_\-\.]*(\d{1,4})/i);
    if (match) return parseInt(match[1], 10);
    match = fileName.match(/\-\s*(\d{1,4})\b/);
    if (match) return parseInt(match[1], 10);
    match = fileName.match(/^(\d{1,4})\./); 
    if (match) return parseInt(match[1], 10);
    match = fileName.match(/(?<!\d)(\d{2,4})\b(?!\s*(?:p|bit|x))/i); 
    if (match) return parseInt(match[1], 10);
    return null;
}

function parseSeasonValue(val) {
    if (!isNaN(val)) return parseInt(val, 10);
    const roman = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10 };
    return roman[val.toUpperCase()] || 1; 
}

function detectSeason(filePath) {
    const parts = filePath.split(path.sep);
    for (let i = parts.length - 2; i >= 0; i--) {
        const match = parts[i].match(/Season\s*([0-9]+|[IVX]+)/i);
        if (match) return parseSeasonValue(match[1]);
    }
    return 1; 
}

function findLocalEpisodesFile(directory) {
    const parentDir = path.dirname(directory); 
    const possiblePaths = [
        path.join(directory, 'episodes.txt'),
        path.join(directory, 'episodes.txt.txt'),
        path.join(parentDir, 'episodes.txt'),
        path.join(parentDir, 'episodes.txt.txt')
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function loadLocalEpisodes(directory) {
    const localFile = findLocalEpisodesFile(directory);
    if (!localFile) return null;

    console.log(`\n📄 Found local text file at: ${localFile}`);
    console.log(`🛑 Bypassing internet search...`);
    
    const lines = fs.readFileSync(localFile, 'utf-8').split('\n');
    const dictionary = {};

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        const match = line.match(/^(?:Episode\s*)?(\d+)[\:\-\.]?\s*(.*)/i);
        if (match) {
            dictionary[parseInt(match[1], 10)] = match[2].trim();
        }
    }
    return Object.keys(dictionary).length > 0 ? dictionary : null;
}

async function getAnimeId(showName) {
    if (/^\d+$/.test(showName)) {
        console.log(`\n🔍 Direct MAL ID provided: ${showName}`);
        return parseInt(showName, 10);
    }
    
    console.log(`\n🔍 Searching MyAnimeList for "${showName}"...`);
    for (let attempts = 1; attempts <= 5; attempts++) {
        try {
            const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(showName)}&order_by=members&sort=desc&limit=1`);
            if (res.status >= 500 || res.status === 429) {
                console.log(`⚠️ API Server congested (Error ${res.status}). Auto-retrying (${attempts}/5)...`);
                await delay(2500);
                continue; 
            }
            if (!res.ok) throw new Error(`API Error ${res.status}`);
            const data = await res.json();
            if (!data.data || data.data.length === 0) return null;
            console.log(`✅ Found Official Show: ${data.data[0].title} (MAL ID: ${data.data[0].mal_id})`);
            return data.data[0].mal_id;
        } catch (err) {
            if (attempts === 5) return null;
            await delay(2500);
        }
    }
    return null;
}

async function fetchEpisodes(malId) {
    console.log(`🌐 Downloading official episode titles...`);
    const officialEpisodes = {};
    let page = 1;
    while (true) {
        let success = false;
        let attempts = 0;
        while (!success && attempts < 5) {
            try {
                attempts++;
                const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`);
                if (res.status >= 500 || res.status === 429) {
                    console.log(`⚠️ API Server congested (Error ${res.status}). Auto-retrying (${attempts}/5)...`);
                    await delay(2500);
                    continue; 
                }
                if (!res.ok) throw new Error(`API returned ${res.status}`);
                const data = await res.json();
                if (!data.data || data.data.length === 0) return officialEpisodes;
                for (const ep of data.data) officialEpisodes[ep.mal_id] = ep.title;
                success = true;
                page++;
                await delay(1500); 
            } catch (err) {
                if (attempts >= 5) return officialEpisodes;
                await delay(3000); 
            }
        }
        if (!success) break;
    }
    return officialEpisodes;
}

// NEW: THE BACKUP DATABASE (TVMAZE)
async function fetchFromBackup(showName) {
    console.log(`\n🔄 MyAnimeList failed. Switching to backup database (TVMaze)...`);
    
    let backupSearchTerm = showName;
    if (/^\d+$/.test(showName)) {
        backupSearchTerm = ROOT_SHOW_NAME.replace(/Season \d+/i, '').trim();
        console.log(`⚠️ Swapped MAL ID for text search: "${backupSearchTerm}"`);
    }

    try {
        const res = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(backupSearchTerm)}&embed=episodes`);
        if (!res.ok) return null;
        const data = await res.json();
        
        console.log(`✅ Backup Database Found: ${data.name}`);
        const episodes = data._embedded?.episodes || [];
        
        const episodeDictionary = {};
        let absoluteCounter = 1;
        
        for (const ep of episodes) {
            if (ep.season === 0) continue;
            episodeDictionary[absoluteCounter] = ep.name;
            absoluteCounter++;
        }
        return Object.keys(episodeDictionary).length > 0 ? episodeDictionary : null;
    } catch (err) {
        return null;
    }
}

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

        // TRIGGER BACKUP IF MAL IS BROKEN
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
    const safeBaseName = ROOT_SHOW_NAME.replace(/[<>:"/\\|?*]+/g, '').trim();

    console.log(`\nRenaming files...`);
    for (const fullPath of allFiles) {
        const fileName = path.basename(fullPath);
        const parentDir = path.dirname(fullPath);
        const ext = path.extname(fileName);
        
        const epNum = extractEpisodeNumber(fileName);
        if (epNum === null) continue;
        if (!episodeDictionary[epNum]) continue;

        const title = episodeDictionary[epNum];
        const seasonNum = detectSeason(fullPath);
        const paddedSeason = seasonNum.toString().padStart(2, '0');
        const paddedEp = epNum.toString().padStart(2, '0');
        const safeTitle = title.replace(/[<>:"/\\|?*]+/g, '').trim();
        
        const newFileName = `${safeBaseName} - S${paddedSeason}EP${paddedEp} - ${safeTitle}${ext}`;
        const newFullPath = path.join(parentDir, newFileName);

        if (fileName === newFileName) continue;

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