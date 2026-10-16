const fs = require('fs');
const path = require('path');
const { 
    scanDirectory, 
    loadLocalEpisodes, 
    extractEpisodeNumber, 
    getAnimeId, 
    fetchEpisodes, 
    fetchFromBackup, 
    delay 
} = require('./anime_utils');

const BASE_DIR = 'D:/Anime'; 

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
    
    let masterMissingList = []; 

    for (let i = 0; i < mainFolders.length; i++) {
        const showName = mainFolders[i];
        const showDir = path.join(BASE_DIR, showName);
        console.log(`[${i + 1}/${mainFolders.length}] Scanning: ${showName}...`);

        let officialEpisodes = loadLocalEpisodes(showDir);
        let usedApi = false;

        if (!officialEpisodes) {
            usedApi = true;
            let cleanName = showName.replace(/Season \d+/i, '').trim();
            const malId = await getAnimeId(cleanName);
            if (malId) officialEpisodes = await fetchEpisodes(malId);
            
            if (!officialEpisodes || Object.keys(officialEpisodes).length === 0) {
                officialEpisodes = await fetchFromBackup(cleanName);
            }
        }

        if (!officialEpisodes || Object.keys(officialEpisodes).length === 0) {
            console.log(`   ⚠️ Could not fetch official data. Skipping.`);
            if (usedApi) await delay(3000);
            continue;
        }

        const localFiles = scanDirectory(showDir);
        const localEpisodeNumbers = new Set();
        for (const fullPath of localFiles) {
            const epNum = extractEpisodeNumber(path.basename(fullPath));
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

        if (usedApi) {
            console.log(`   ⏳ Waiting 3 seconds for API cooldown...`);
            await delay(3000); 
        }
    }

    console.log(`\n=============================================`);
    console.log(`📊 COMPILING MASTER REPORT...`);
    
    if (masterMissingList.length === 0) {
        console.log(`🎉 INCREDIBLE! Your entire library is 100% complete!`);
        return;
    }

    masterMissingList.sort((a, b) => a.show.localeCompare(b.show));

    let textReport = `=============================================\n`;
    textReport += `        MASTER MISSING EPISODES REPORT\n`;
    textReport += `        Generated on: ${new Date().toLocaleDateString()}\n`;
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