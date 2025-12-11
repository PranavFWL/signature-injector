const express = require("express");
const router = express.Router();

// Upload PDF to MongoDB (GridFS)
router.post("/upload-pdf", async (req, res) => {
  try {
    const db = req.db;
    const gfs = req.gfs;

    if (!gfs) return res.status(500).json({ error: "GridFS not ready" });

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const buffer = Buffer.concat(chunks);

      // filename for GridFS
      const filename = "pdf_" + Date.now() + ".pdf";

      // Create upload stream
      const uploadStream = gfs.openUploadStream(filename, {
        contentType: "application/pdf",
      });

      uploadStream.end(buffer);

      uploadStream.on("finish", () => {
        return res.json({
          pdfId: uploadStream.id.toString(),
          filename: filename,
        });
      });

      uploadStream.on("error", (err) => {
        console.error("Upload error:", err);
        res.status(500).json({ error: "Upload failed" });
      });
    });
  } catch (err) {
    console.error("Upload exception:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

module.exports = router;
