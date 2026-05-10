// api.js

async function getEpisodeTitle(showName, episodeNumber) {
    try {
        console.log(`Searching API for: "${showName}"...`);
        
        // 1. Search for the anime to get its ID
        const searchUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(showName)}&limit=1`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (!searchData.data || searchData.data.length === 0) {
            console.log(`❌ Could not find show: ${showName} on MyAnimeList.`);
            return null;
        }

        const animeId = searchData.data[0].mal_id;
        const officialTitle = searchData.data[0].title;
        console.log(`✅ Found Anime: ${officialTitle} (MAL ID: ${animeId})`);

        // 2. Fetch the episodes for that ID
        // Note: Jikan handles episodes in pages, but for now we'll check the first page
        const epUrl = `https://api.jikan.moe/v4/anime/${animeId}/episodes`;
        const epRes = await fetch(epUrl);
        const epData = await epRes.json();

        if (!epData.data) {
            console.log(`❌ Could not retrieve episodes for ${officialTitle}.`);
            return null;
        }

        // 3. Find the specific episode by its number
        // We use parseInt to ensure "01" matches "1"
        const episode = epData.data.find(ep => ep.mal_id === parseInt(episodeNumber));

        if (episode) {
            console.log(`✅ Episode ${episodeNumber} Official Title: "${episode.title}"`);
            return episode.title;
        } else {
            console.log(`❌ Could not find episode ${episodeNumber} in the database.`);
            return null;
        }

    } catch (error) {
        console.error("API Error:", error.message);
    }
}

// --- TESTING THE FUNCTION ---
// Let's test it using the exact data your scanner just found!
getEpisodeTitle("18if", "01");