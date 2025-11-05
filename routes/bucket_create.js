const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// Nakama API Config
const NAKAMA_URL = "http://localhost:7350/v2/rpc/create_bucket";
const HEADERS = {
  "Content-Type": "application/json",
  "Authorization": "Basic ZGVmYXVsdGtleTo=",
};

// constants
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 50;
const mainDir = path.resolve(__dirname, "..");

// upload one batch to Nakama API
async function uploadBucketBatch(bucketName, batch, batchNumber, totalBatches, isGlobal) {
  const body = JSON.stringify({
    bucket_name: bucketName,
    is_global: isGlobal,
    mappings: batch,
  });

  console.log(
    `🚀 Uploading batch ${batchNumber}/${totalBatches} (${batch.length} mappings) for "${bucketName}" (is_global=${isGlobal})`
  );

  try {
    const response = await axios.post(NAKAMA_URL, JSON.stringify(body), { headers: HEADERS });
    console.log(`✅ Batch ${batchNumber}/${totalBatches} uploaded successfully (status: ${response.status})`);
  } catch (err) {
    console.error(
      `❌ Error uploading batch ${batchNumber}/${totalBatches} for "${bucketName}":`,
      err.response ? `${err.response.status} ${err.response.statusText}` : err.message
    );
  }
}

// process one file (one bucket)
async function processBucketFile(fileName, isGlobal) {
  const filePath = path.join(mainDir, fileName);
  const bucketName = path.parse(fileName).name;

  console.log(`\n📦 Reading file: ${fileName}`);

  try {
    const data = await fs.readFile(filePath, "utf-8");

    if (!data.trim()) {
      console.warn(`⚠️ Skipping empty file: ${fileName}`);
      return;
    }

    let jsonData;
    try {
      jsonData = JSON.parse(data);
    } catch (parseErr) {
      console.error(`❌ Invalid JSON in ${fileName}: ${parseErr.message}`);
      return;
    }

    if (!jsonData.levelDetails || !Array.isArray(jsonData.levelDetails)) {
      console.warn(`⚠️ "levelDetails" missing or invalid in ${fileName}. Skipping.`);
      return;
    }

    const allMappings = jsonData.levelDetails;
    console.log(`📊 Found ${allMappings.length} mappings in ${fileName}`);

    const totalBatches = Math.ceil(allMappings.length / BATCH_SIZE);
    console.log(totalBatches);

    for (let i = 0; i < totalBatches; i++) {
      const start = i * BATCH_SIZE;
      const end = start + BATCH_SIZE;
      const batch = allMappings.slice(start, end);
      // console.log(i,batch.length);
      await uploadBucketBatch(bucketName, batch, i + 1, totalBatches, isGlobal);
    }

    console.log(`🎯 Finished uploading all ${allMappings.length} mappings for "${bucketName}"`);
  } catch (err) {
    console.error(`❌ Error processing "${fileName}": ${err.message}`);
  }
}

// main route: upload-buckets
router.post("/upload-buckets", async (req, res) => {
  const { buckets, is_global } = req.body;

  if (!buckets || !Array.isArray(buckets) || buckets.length === 0) {
    return res.status(400).json({
      error: "Please provide an array of bucket file names in 'buckets'.",
      example: { buckets: ["bucket1.json"], is_global: false },
    });
  }

  if (typeof is_global !== "boolean") {
    return res.status(400).json({
      error: "Please provide a boolean value for 'is_global' (true or false).",
    });
  }

  console.log("\n===============================================");
  console.log(`📂 Buckets to upload: ${buckets.join(", ")}`);
  console.log(`🌍 is_global: ${is_global}`);
  console.log("===============================================\n");

  try {
    const filesInDir = await fs.readdir(mainDir);
    const jsonFiles = filesInDir.filter((f) => f.endsWith(".json"));

    let processedCount = 0;

    for (const bucketFile of buckets) {
      if (!jsonFiles.includes(bucketFile)) {
        console.warn(`⚠️ File "${bucketFile}" not found. Skipping.`);
        continue;
      }
      await processBucketFile(bucketFile, is_global);
      processedCount++;
    }

    if (processedCount === 0) {
      return res.status(404).json({
        message: "No valid bucket files found in folder.",
      });
    }

    res.json({
      message: "✅ Selected bucket files processed successfully.",
      processed_files: processedCount,
    });
  } catch (err) {
    console.error("❌ Error during upload process:", err.message);
    res.status(500).json({
      error: "Internal server error while uploading bucket data.",
      details: err.message,
    });
  }
});

module.exports = router;