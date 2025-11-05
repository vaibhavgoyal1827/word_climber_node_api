require("dotenv").config();

const express = require("express");
const app = express();

// for reading json data
app.use(express.json());


//requiring routes
const bucketRoute = require('./routes/bucket_create');
const fileLevelRoute = require('./routes/file_level');

// middleware for running all the routes
app.use(bucketRoute);
app.use(fileLevelRoute);


const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
