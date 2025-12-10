// backend/routes/download.js
const express = require("express");
const router = express.Router();

router.get("/pdf/:id", (req, res) => {
  try {
    const gfs = req.gfs;
    const fileId = new req.ObjectId(req.params.id);

    const downloadStream = gfs.openDownloadStream(fileId);

    res.set("Content-Type", "application/pdf");

    downloadStream.on("error", (err) => {
      console.error("Download error:", err);
      return res.status(404).json({ error: "PDF not found" });
    });

    downloadStream.pipe(res);
  } catch (err) {
    console.error("Download route error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
