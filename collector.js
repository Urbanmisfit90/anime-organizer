const fs = require('fs');
const path = require('path');

const TARGET_DIR = 'D:/Anime'; 

function scanDirectory(directory) {
    let results = [];
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

console.log(`Scanning ${TARGET_DIR} for Unknown Episodes...`);

const allFiles = scanDirectory(TARGET_DIR);
// Filter down to only files with "Unknown Episode" in the name
const unknownFiles = allFiles.filter(file => file.includes("Unknown Episode"));

if (unknownFiles.length > 0) {
    // Join the array into a single text block, separated by new lines
    const fileContent = unknownFiles.join('\n');
    
    // Write it to a text file
    fs.writeFileSync('unknown_episodes_list.txt', fileContent);
    
    console.log(`✅ Found ${unknownFiles.length} files!`);
    console.log(`Saved master list to 'unknown_episodes_list.txt' in this folder.`);
} else {
    console.log("🎉 Zero Unknown Episodes found! Your library is perfect.");
}