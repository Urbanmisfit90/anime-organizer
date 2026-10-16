const fs = require('fs');
const path = require('path');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function scanDirectory(directory) {
    let results = [];
    if (!fs.existsSync(directory)) return results;
    const files = fs.readdirSync(directory);
    for (const file of files) {
        const fullPath = path.join(directory, file);
        if (fs.statSync(fullPath).isDirectory()) {
            // Skip non-episode subfolders like specials, OVAs, or movies to avoid counting false positives
            if (/^(specials|ova|ovas|movies|extras)/i.test(file)) continue;
            results = results.concat(scanDirectory(fullPath));
        } else {
            if (file.match(/\.(mp4|mkv|avi|m4v)$/i)) results.push(fullPath);
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
        // FIX: Added \s* before the separator to prevent double-hyphen issues ("01 - Title" -> "Title")
        const match = line.match(/^(?:Episode\s*)?(\d+)\s*[\:\-\.]?\s*(.*)/i);
        if (match) {
            dictionary[parseInt(match[1], 10)] = { title: match[2].trim(), aired: 'Local Override' };
        }
    }
    return Object.keys(dictionary).length > 0 ? dictionary : null;
}

function extractEpisodeNumber(fileName) {
    const baseName = path.parse(fileName).name;
    // FIX: Strip bracketed/parenthesized tags and video codecs/resolutions first to prevent false matches (e.g. "x265", "1080p")
    const cleanName = baseName
        .replace(/\[.*?\]|\(.*?\)/g, ' ')
        .replace(/\b(?:1080p|720p|480p|2160p|4k|x264|x265|h264|h265|hevc|10bit|8bit|aac)\b/gi, ' ');

    // Match explicit patterns like S01E01, EP01, Episode 01, or standalone E01 with word boundaries (\b)
    let match = cleanName.match(/\b(?:s\d{1,2}[\s_\-\.]*e|ep|episode|e)[\s_\-\.]*(\d{1,4})\b/i);
    if (match) return parseInt(match[1], 10);

    // Match standard anime dash format "- 01"
    match = cleanName.match(/\-\s*(\d{1,4})\b/);
    if (match) return parseInt(match[1], 10);

    // Match leading numbers "01. Title"
    match = baseName.match(/^(\d{1,4})(?:[\.\-\s_]|$)/);
    if (match) return parseInt(match[1], 10);

    // Fallback: Last isolated 2-4 digit number in the cleaned title
    match = cleanName.match(/(?<!\d)(\d{2,4})\b/g);
    if (match && match.length > 0) {
        return parseInt(match[match.length - 1], 10);
    }
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

function sanitizeFileName(name) {
    return name
        .replace(/:/g, ' -')
        .replace(/[\/\\]/g, '-')
        .replace(/[<>:"/\\|?*]+/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\.+$/, '')
        .trim();
}

async function getAnimeId(showName) {
    if (/^\d+$/.test(showName)) {
        return parseInt(showName, 10);
    }
    for (let attempts = 1; attempts <= 5; attempts++) {
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
            if (attempts === 5) return null;
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
        while (!success && attempts < 5) {
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
                    officialEpisodes[ep.mal_id] = {
                        title: ep.title,
                        aired: ep.aired ? new Date(ep.aired).toLocaleDateString() : 'Unknown'
                    };
                }
                // FIX: Stop looping early if pagination confirms no more pages exist
                if (!data.pagination?.has_next_page) return officialEpisodes;
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

async function fetchFromBackup(showName, targetSeason = null) {
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
            if (targetSeason !== null && ep.season !== targetSeason) continue;

            const key = targetSeason !== null ? ep.number : absoluteCounter;
            officialEpisodes[key] = {
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

module.exports = {
    scanDirectory,
    loadLocalEpisodes,
    extractEpisodeNumber,
    detectSeason,
    sanitizeFileName,
    getAnimeId,
    fetchEpisodes,
    fetchFromBackup,
    delay
};