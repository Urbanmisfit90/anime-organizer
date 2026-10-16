const fs = require('fs');
const path = require('path');

const BASE_DIR = 'D:/Anime'; // Hardcoded base directory for the batch run
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
    const lines = fs.readFileSync(localFile, 'utf-8').split('\n');
    const dictionary = {};
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        const match = line.match(/^(?:Episode\s*)?(\d+)[\:\-\.]?\s*(.*)/i);
        if (match) {
            dictionary[parseInt(match[1], 10)] = { title: match[2].trim(), aired: 'Local Override' };
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
    for (let attempts = 1; attempts <= 3; attempts++) {
        try {
            const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(showName)}&order_by=members&sort=desc&limit=1`);
            if (res.status >= 500 || res.status === 429) {
                await delay(2500);
                continue; 
            }
            if (!res.ok) throw new Error(`API Error ${res.status}`);
            const data = await res.json();
            if (!data.data || data.data.length === 0) return null;
            return data.data[0].mal_id;
        } catch (err) {
            if (attempts === 3) return null;
            await delay(2500);
        }
    }
    return null;
}

async function fetchEpisodes(malId) {
    const officialEpisodes = {};
    let page = 1;
    while (true) {
        let success = false;
        let attempts = 0;
        while (!success && attempts < 3) {
            try {
                attempts++;
                const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`);
                if (res.status >= 500 || res.status === 429) {
                    await delay(2500);
                    continue; 
                }
                if (!res.ok) throw new Error(`API returned ${res.status}`);
                const data = await res.json();
                if (!data.data || data.data.length === 0) return officialEpisodes;
                for (const ep of data.data) {
                    officialEpisodes[ep.mal_id] = { title: ep.title, aired: ep.aired ? new Date(ep.aired).toLocaleDateString() : 'Unknown' };
                }
                success = true;
                page++;
                await delay(1500); 
            } catch (err) {
                if (attempts >= 3) return officialEpisodes;
                await delay(3000); 
            }
        }
        if (!success) break;
    }
    return officialEpisodes;
}

async function fetchFromBackup(showName) {
    let cleanSearchName = showName.replace(/Season \d+/i, '').trim();
    try {
        const res = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(cleanSearchName)}&embed=episodes`);
        if (!res.ok) return null;
        const data = await res.json();
        const episodes = data._embedded?.episodes || [];
        const officialEpisodes = {};
        let absoluteCounter = 1;
        for (const ep of episodes) {
            if (ep.season === 0) continue; 
            officialEpisodes[absoluteCounter] = { title: ep.name, aired: ep.airdate ? new Date(ep.airdate).toLocaleDateString() : 'Unknown' };
            absoluteCounter++;
        }
        return Object.keys(officialEpisodes).length > 0 ? officialEpisodes : null;
    } catch (err) {
        return null;
    }
}

async function runBatch() {
    console.log(`=============================================`);
    console.log(`🚀 INITIATING MASTER BATCH SCAN`);
    console.log(`Directory: ${BASE_DIR}`);
    console.log(`=============================================`);

    if (!fs.existsSync(BASE_DIR)) {
        console.log(`❌ Base directory ${BASE_DIR} does not exist!`);
        return;
    }

    const mainFolders = fs.readdirSync(BASE_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    console.log(`📂 Found ${mainFolders.length} anime folders to scan.\n`);
    
    let masterMissingList = []; // Will store objects: { show: 'Name', missing: ['EP01...', 'EP02...'] }

    for (let i = 0; i < mainFolders.length; i++) {
        const showName = mainFolders[i];
        const showDir = path.join(BASE_DIR, showName);
        console.log(`[${i + 1}/${mainFolders.length}] Scanning: ${showName}...`);

        let officialEpisodes = loadLocalEpisodes(showDir);

        if (!officialEpisodes) {
            let cleanName = showName.replace(/Season \d+/i, '').trim();
            const malId = await getAnimeId(cleanName);
            if (malId) officialEpisodes = await fetchEpisodes(malId);
            
            if (!officialEpisodes || Object.keys(officialEpisodes).length === 0) {
                officialEpisodes = await fetchFromBackup(cleanName);
            }
        }

        if (!officialEpisodes || Object.keys(officialEpisodes).length === 0) {
            console.log(`   ⚠️ Could not fetch official data. Skipping.`);
            await delay(3000); // Strict API rate limit wait
            continue;
        }

        const localFiles = scanDirectory(showDir);
        const localEpisodeNumbers = new Set();
        for (const fileName of localFiles) {
            const epNum = extractEpisodeNumber(fileName);
            if (epNum !== null) localEpisodeNumbers.add(epNum);
        }

        const sortedExpectedEps = Object.keys(officialEpisodes).map(Number).sort((a,b) => a - b);
        let currentShowMissing = [];

        for (const epNum of sortedExpectedEps) {
            if (!localEpisodeNumbers.has(epNum)) {
                const epData = officialEpisodes[epNum];
                const paddedEp = epNum.toString().padStart(2, '0');
                currentShowMissing.push(`EP${paddedEp} - ${epData.title}`);
            }
        }

        if (currentShowMissing.length > 0) {
            console.log(`   ❌ Missing ${currentShowMissing.length} episodes.`);
            masterMissingList.push({
                show: showName,
                missing: currentShowMissing
            });
        } else {
            console.log(`   ✅ 100% Complete!`);
        }

        // Extremely important to prevent API bans
        console.log(`   ⏳ Waiting 3 seconds for API cooldown...`);
        await delay(3000); 
    }

    console.log(`\n=============================================`);
    console.log(`📊 COMPILING MASTER REPORT...`);
    
    if (masterMissingList.length === 0) {
        console.log(`🎉 INCREDIBLE! Your entire library is 100% complete!`);
        return;
    }

    // Sort alphabetically by show name
    masterMissingList.sort((a, b) => a.show.localeCompare(b.show));

    let textReport = `=============================================\n`;
    textReport += `       MASTER MISSING EPISODES REPORT\n`;
    textReport += `       Generated on: ${new Date().toLocaleDateString()}\n`;
    textReport += `=============================================\n\n`;

    for (const item of masterMissingList) {
        textReport += `[ ${item.show} ] - Missing ${item.missing.length} episodes\n`;
        textReport += `---------------------------------------------\n`;
        for (const ep of item.missing) {
            textReport += `  ❌ ${ep}\n`;
        }
        textReport += `\n`;
    }

    const reportPath = path.join(BASE_DIR, 'Master_Missing_Report.txt');
    try {
        fs.writeFileSync(reportPath, textReport);
        console.log(`📝 SUCCESSFULLY SAVED REPORT TO:`);
        console.log(`   ${reportPath}`);
    } catch (err) {
        console.log(`❌ Could not save text file: ${err.message}`);
    }
    console.log(`=============================================`);
}

runBatch();