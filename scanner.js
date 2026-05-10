const fs = require('fs');
const path = require('path');

const TARGET_DIR = 'D:/Anime'; 
const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi'];

// --- 1. PARSING FUNCTIONS ---

function extractShowTitle(folderName) {
    return folderName
        .replace(/\([^)]*\)/g, '') // Removes (parentheses)
        .replace(/\b(complete|series|seasons?|ovas?)\b/gi, '') // Removes grouping words
        .replace(/\d+\s*-\s*\d+/g, '') // Removes ranges like "1-24"
        .replace(/\b\d\s*&\s*\d\b/g, '') // Removes "1 & 2"
        .replace(/[-+&]/g, ' ') // Cleans up leftover symbols
        .replace(/\s{2,}/g, ' ') // Removes double spaces
        .trim();
}

function extractEpisodeNumber(fileName) {
    // Looks for a hyphen or "Ep" followed by numbers
    const episodeRegex = /(?:e|ep|episode|\-)\s*(\d{1,4})/i;
    const match = fileName.match(episodeRegex);
    
    if (match) {
        return match[1].padStart(2, '0'); // Pads "1" to "01"
    }
    
    // Fallback if no hyphen/ep marker is used
    const fallbackRegex = /(?<!\d)(\d{2,4})(?!\w*p)/i;
    const fallbackMatch = fileName.match(fallbackRegex);
    
    return fallbackMatch ? fallbackMatch[1] : "Unknown"; 
}

// --- 2. SCANNING FUNCTION ---

function scanDirectory(directory) {
    let results = [];
    const files = fs.readdirSync(directory);

    for (const file of files) {
        const fullPath = path.join(directory, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            results = results.concat(scanDirectory(fullPath));
        } else {
            const ext = path.extname(fullPath).toLowerCase();
            if (VIDEO_EXTENSIONS.includes(ext)) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

// --- 3. EXECUTION & TEST ---

try {
    console.log(`Scanning: ${TARGET_DIR}...\n`);
    const videoFiles = scanDirectory(TARGET_DIR);
    
    console.log(`Found ${videoFiles.length} video files!`);
    console.log("Parsing the first 5 files to test our extraction logic:\n");

    // Take just the first 5 files to test
    const testBatch = videoFiles.slice(0, 5);

    testBatch.forEach(fullPath => {
        // path.basename gets the file name: "[Golumpa] 18if - 01...mkv"
        const fileName = path.basename(fullPath);
        
        // path.dirname gets the folder path, then basename gets the specific folder name: "18if"
        const parentFolder = path.basename(path.dirname(fullPath));

        // Run them through our Regex extractors
        const showTitle = extractShowTitle(parentFolder);
        const episode = extractEpisodeNumber(fileName);

        console.log(`File:   ${fileName}`);
        console.log(`Result: Show: "${showTitle}" | Episode: "${episode}"`);
        console.log('--------------------------------------------------');
    });
    
} catch (error) {
    console.error("Error scanning directory:", error.message);
}