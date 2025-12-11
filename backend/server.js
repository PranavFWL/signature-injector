require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, GridFSBucket, ObjectId } = require("mongodb");
const routes = require("./routes");
const mongoose = require("mongoose");

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

const app = express();
app.use(cors({
  origin: [
    "https://signature-injector-weld.vercel.app",
    "https://signature-injector-blue.vercel.app",
    "https://signature-injector-henna.vercel.app",
    "http://localhost:3000"
  ],
  methods: ["GET", "POST"],
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

const MONGO_URI = process.env.MONGODB_URI;

const client = new MongoClient(MONGO_URI);

async function start() {
  await client.connect();
  console.log("Connected to MongoDB");

  const db = client.db();
  console.log("GridFSBucket initialized");

  const gfs = new GridFSBucket(db, { bucketName: "pdfs" });

  app.use((req, res, next) => {
    req.db = db;
    req.gfs = gfs;
    req.ObjectId = ObjectId;
    next();
  });

  app.use("/", routes);

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start();
