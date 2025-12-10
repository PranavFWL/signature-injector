// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { GridFSBucket, ObjectId } = require("mongodb");
const routes = require("./routes");

// ----------------------------------
// 1. CONNECT TO MONGO USING MONGOOSE
// ----------------------------------
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// --------------------------------------------------
// 2. After Mongoose connects, initialize GridFSBucket
// --------------------------------------------------
let gfs;

mongoose.connection.on("connected", () => {
  const db = mongoose.connection.db;
  gfs = new GridFSBucket(db, { bucketName: "pdfs" });
  console.log("GridFSBucket initialized");
});

// ---------------------------------------
// 3. Attach DB + GridFS to every request
// ---------------------------------------
app.use((req, res, next) => {
  req.db = mongoose.connection.db;
  req.gfs = gfs;
  req.ObjectId = ObjectId;
  next();
});

// --------------------
// 4. Mount API routes
// --------------------
app.use("/", routes);

// --------------------
// 5. Start the server
// --------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
