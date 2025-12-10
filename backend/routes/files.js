// backend/routes/file.js
const express = require("express");
const router = express.Router();

router.get("/file/:id", async (req, res) => {
  try {
    const gfs = req.gfs;
    const ObjectId = req.ObjectId;
    const fileId = new ObjectId(req.params.id);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=signed.pdf",
    });

    const readStream = gfs.openDownloadStream(fileId);

    readStream.on("error", (err) => {
      console.error("GridFS read error:", err);
      return res.status(404).json({ error: "File not found" });
    });

    readStream.pipe(res);
  } catch (err) {
    console.error("file route error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
