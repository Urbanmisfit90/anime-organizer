const fs = require('fs');
const path = require('path');
const { 
    scanDirectory, 
    loadLocalEpisodes, 
    extractEpisodeNumber, 
    getAnimeId, 
    fetchEpisodes, 
    fetchFromBackup 
} = require('./anime_utils');

const TARGET_DIR = process.argv[2];
const RAW_FOLDER_SELECTION = process.argv[3] || path.basename(TARGET_DIR || ''); 
const USER_SEARCH_NAME = process.argv[4]; 

const folderParts = RAW_FOLDER_SELECTION.split(/[\/\\]/);
const ROOT_SHOW_NAME = folderParts[0]; 

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
    for (const fullPath of localFiles) {
        const epNum = extractEpisodeNumber(path.basename(fullPath));
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
        } catch (err) {
            console.error(`❌ Could not save text file: ${err.message}`);
        }
    }
    console.log(`=============================================`);
}

run();