const fs = require('fs');
const path = require('path');

const TARGET_DIR = process.argv[2];
const RAW_FOLDER_SELECTION = process.argv[3]; 
const USER_SEARCH_NAME = process.argv[4]; 

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
            if (file.match(/\.(mp4|mkv|avi|m4v)$/i)) results.push(file); 
        }
    }
    return results;
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
            const epNum = parseInt(match[1], 10);
            const title = match[2].trim();
            dictionary[epNum] = { title: title, aired: 'Local Override' };
        }
    }
    return Object.keys(dictionary).length > 0 ? dictionary : null;
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
    console.log(`🌐 Downloading official episode list...`);
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
                for (const ep of data.data) {
                    officialEpisodes[ep.mal_id] = {
                        title: ep.title,
                        aired: ep.aired ? new Date(ep.aired).toLocaleDateString() : 'Unknown'
                    };
                }
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
    
    // If the user entered an ID for MAL, TVMaze won't understand it. Use the folder name instead.
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
        
        const officialEpisodes = {};
        let absoluteCounter = 1;
        
        for (const ep of episodes) {
            if (ep.season === 0) continue; // Skips TV specials
            officialEpisodes[absoluteCounter] = {
                title: ep.name,
                aired: ep.airdate ? new Date(ep.airdate).toLocaleDateString() : 'Unknown'
            };
            absoluteCounter++;
        }
        return Object.keys(officialEpisodes).length > 0 ? officialEpisodes : null;
    } catch (err) {
        return null;
    }
}

async function run() {
    console.log(`=============================================`);
    console.log(`MISSING EPISODE SCANNER`);
    console.log(`Target: ${TARGET_DIR}`);
    console.log(`=============================================`);

    let officialEpisodes = loadLocalEpisodes(TARGET_DIR);

    if (!officialEpisodes) {
        const cleanSearchName = USER_SEARCH_NAME || ROOT_SHOW_NAME.replace(/Season \d+/i, '').trim();
        const malId = await getAnimeId(cleanSearchName);
        
        if (malId) {
            officialEpisodes = await fetchEpisodes(malId);
        }

        // TRIGGER BACKUP IF MAL IS BROKEN
        if (!officialEpisodes || Object.keys(officialEpisodes).length === 0) {
            officialEpisodes = await fetchFromBackup(cleanSearchName);
        }
    }

    if (!officialEpisodes || Object.keys(officialEpisodes).length === 0) {
        console.log(`❌ Could not get episode data from primary or backup databases. Aborting.`);
        return;
    }

    const localFiles = scanDirectory(TARGET_DIR);
    const localEpisodeNumbers = new Set();
    for (const fileName of localFiles) {
        const epNum = extractEpisodeNumber(fileName);
        if (epNum !== null) localEpisodeNumbers.add(epNum);
    }

    const totalOfficial = Object.keys(officialEpisodes).length;
    console.log(`\n📂 Found ${localEpisodeNumbers.size} valid episodes on your hard drive.`);
    console.log(`📺 Expected list shows ${totalOfficial} total episodes.`);
    console.log(`\n🚨 CALCULATING MISSING EPISODES 🚨`);
    console.log(`---------------------------------------------`);

    let missingCount = 0;
    let textReport = `Missing Episodes for: ${ROOT_SHOW_NAME}\n`;
    textReport += `Generated on: ${new Date().toLocaleDateString()}\n---------------------------------------------\n`;

    const sortedExpectedEps = Object.keys(officialEpisodes).map(Number).sort((a,b) => a - b);
    for (const epNum of sortedExpectedEps) {
        if (!localEpisodeNumbers.has(epNum)) {
            const epData = officialEpisodes[epNum];
            const paddedEp = epNum.toString().padStart(2, '0');
            let airedStr = epData.aired !== 'Local Override' ? ` (Aired: ${epData.aired})` : '';
            const logMessage = `Missing: EP${paddedEp} - ${epData.title}${airedStr}`;
            console.log(`❌ ${logMessage}`);
            textReport += `${logMessage}\n`;
            missingCount++;
        }
    }

    console.log(`---------------------------------------------`);
    if (missingCount === 0) {
        console.log(`🎉 CONGRATULATIONS! Your collection for this show is 100% complete!`);
    } else {
        console.log(`⚠️ You are missing ${missingCount} episodes.`);
        try {
            const reportPath = path.join(TARGET_DIR, 'Missing_Episodes.txt');
            fs.writeFileSync(reportPath, textReport);
            console.log(`📝 Saved missing episodes list to: ${reportPath}`);
        } catch (err) {}
    }
    console.log(`=============================================`);
}

run();