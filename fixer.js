const fs = require('fs');
const path = require('path');
const readline = require('readline');

const TARGET_DIR = 'D:/Anime'; 
const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi'];

// Set up the terminal prompt
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// A standard helper function to prompt the user and wait for an answer
const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

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

async function fixUnknowns() {
    console.log(`Hunting for "Unknown Episode" files in ${TARGET_DIR}...\n`);
    
    const allFiles = scanDirectory(TARGET_DIR);
    
    // Filter the massive list down to ONLY the ones that got tagged as Unknown
    const unknownFiles = allFiles.filter(file => file.includes("Unknown Episode"));
    
    if (unknownFiles.length === 0) {
        console.log("🎉 No 'Unknown Episode' files found! You are completely clean.");
        rl.close();
        return;
    }

    console.log(`Found ${unknownFiles.length} files that need manual naming.\n`);

    for (const fullPath of unknownFiles) {
        const currentName = path.basename(fullPath);
        const folderName = path.basename(path.dirname(fullPath));
        
        console.log(`\n------------------------------------------------`);
        console.log(`Folder: ${folderName}`);
        console.log(`File:   ${currentName}`);
        
        // Ask for the real title
        const newTitle = await askQuestion(`\nType the real episode title (or press Enter to skip): `);
        
        if (newTitle.trim() !== "") {
            // Replace "Unknown Episode" with whatever you just typed
            const safeTitle = newTitle.replace(/[<>:"/\\|?*]+/g, '');
            const newName = currentName.replace("Unknown Episode", safeTitle);
            const newFullPath = path.join(path.dirname(fullPath), newName);
            
            try {
                fs.renameSync(fullPath, newFullPath);
                console.log(`✅ Renamed to: ${newName}`);
            } catch (err) {
                console.log(`❌ Error renaming: ${err.message}`);
            }
        } else {
            console.log("⏭️ Skipped.");
        }
    }

    console.log(`\nAll done!`);
    rl.close();
}

fixUnknowns();