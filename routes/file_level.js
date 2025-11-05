const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// Nakama API Config
const NAKAMA_URL = "http://localhost:7350/v2/rpc/save_levels_batch";
const HEADERS = {
  "Content-Type": "application/json",
  "Authorization": "Basic ZGVmYXVsdGtleTo=",
};

// Folder setup
const mainDir = path.resolve(__dirname, "..");
// const foldersToRead = []; // main game folders
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 50;


// function to collect all JSON level files in a folder
async function collectLevels(folderPath) {
  let levels = [];

  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });

    // Sort naturally like level_1 < level_2 < level_10
    entries.sort((a, b) => {
      const aNum = a.name.match(/(\d+)/);
      const bNum = b.name.match(/(\d+)/);
      if (aNum && bNum) return parseInt(aNum[1]) - parseInt(bNum[1]);
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);

      if (entry.isDirectory()) {
        const subLevels = await collectLevels(fullPath);
        levels.push(...subLevels);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        try {
          const data = await fs.readFile(fullPath, "utf-8");

          if (!data.trim()) {
            console.warn(`⚠️ Skipping empty file: ${fullPath}`);
            continue;
          }

          let jsonData;
          try {
            jsonData = JSON.parse(data);
          } catch (parseErr) {
            console.warn(`⚠️ Invalid JSON in: ${fullPath} (${parseErr.message})`);
            continue;
          }

          if (typeof jsonData !== "object" || jsonData === null) {
            console.warn(`⚠️ Skipping non-object JSON file: ${fullPath}`);
            continue;
          }

          const match = entry.name.match(/level[_-]?0*(\d+)/i);
          const levelId = match ? match[1] : entry.name.replace(".json", "");

          levels.push({
            level_id: levelId,
            level_data: jsonData,
          });
        } catch (err) {
          console.error(`❌ Error reading ${fullPath}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`❌ Error reading folder ${folderPath}: ${err.message}`);
  }

  return levels;
}


// Upload a single batch
async function uploadLevelsBatch(gameId, batch, batchNumber, totalBatches) {
  const body = JSON.stringify({
    game_id: gameId,
    levels: batch,
  });

  console.log(
    `🚀 Uploading batch ${batchNumber}/${totalBatches} (${batch.length} levels) for "${gameId}"...`
  );

  try {
    const response = await axios.post(NAKAMA_URL, JSON.stringify(body), { headers: HEADERS });
    console.log(
      `✅ Uploaded batch ${batchNumber}/${totalBatches} for "${gameId}". Status: ${response.status}`
    );
  } catch (err) {
    console.error(
      `❌ Error uploading batch ${batchNumber}/${totalBatches} for "${gameId}":`,
      err.response ? err.response.statusText : err.message
    );
  }
}

// Process each game folder
async function processGameFolder(folderName) {
  console.log(`\n📂 Processing game folder: ${folderName.toUpperCase()} ...`);
  const folderPath = path.join(mainDir, folderName);

  const allLevels = await collectLevels(folderPath);
  console.log(`📊 Total valid levels collected for "${folderName}": ${allLevels.length}`);

  const totalBatches = Math.ceil(allLevels.length / BATCH_SIZE);

  for (let i = 0; i < totalBatches; i++) {
    const start = i * BATCH_SIZE;
    const end = start + BATCH_SIZE;
    const batch = allLevels.slice(start, end);
    // console.log(i,batch.length);
    await uploadLevelsBatch(folderName, batch, i + 1, totalBatches);
  }

  console.log(`🎯 Completed uploading all ${allLevels.length} levels for "${folderName}".`);
}

//  Endpoint to trigger uploads
router.post("/upload-levels", async (req, res) => {
  try {
    const { folders } = req.body;

    if (!folders || !Array.isArray(folders) || folders.length === 0) {
      return res.status(400).json({
        error: "Please provide an array of folder names in 'folders'.",
        example: { folders: ["ws", "bs", "wb"] },
      });
    }

    console.log(`\n🧩 Folders to process: ${folders.join(", ")}\n`);

    for (const folder of folders) {
      await processGameFolder(folder);
    }

    res.send("✅ All specified folders processed successfully! Check console for details.");
  } catch (err) {
    console.error("❌ Error uploading levels:", err);
    res.status(500).send("❌ Error uploading levels.");
  }
});

module.exports = router;