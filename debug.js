const fs = require('fs');

// Looking inside the nested folder now!
const files = fs.readdirSync('D:/Anime/One Piece/One Piece').slice(0, 5);

console.log("\n--- EXACT FILE NAMES ---");
console.log(files);
console.log("------------------------\n");