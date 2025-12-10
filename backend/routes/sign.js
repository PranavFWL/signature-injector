// backend/routes/sign.js
const express = require("express");
const router = express.Router();
const { PDFDocument, rgb } = require("pdf-lib");

router.post("/sign-pdf", async (req, res) => {
  try {
    const db = req.db;
    const gfs = req.gfs;
    const ObjectId = req.ObjectId;

    const { pdfId, signatureBase64, coords } = req.body;

    if (!pdfId || !signatureBase64) {
      return res.status(400).json({ error: "Missing pdfId or signature" });
    }

    // FIX: MUST use new ObjectId()
    const fileId = new ObjectId(pdfId);

    // 1️⃣ Read PDF from Mongo GridFS
    const chunks = [];
    const downloadStream = gfs.openDownloadStream(fileId);

    downloadStream.on("data", (chunk) => chunks.push(chunk));
    downloadStream.on("error", (err) => {
      console.error("GridFS read error:", err);
      res.status(500).json({ error: "Failed to read PDF" });
    });

    downloadStream.on("end", async () => {
      const pdfBytes = Buffer.concat(chunks);

      // 2️⃣ Load PDF using pdf-lib
      const pdfDoc = await PDFDocument.load(pdfBytes);

      const page = pdfDoc.getPage(coords.pageIndex);

      // Convert signature image
      const pngBytes = Buffer.from(signatureBase64, "base64");
      const pngImage = await pdfDoc.embedPng(pngBytes);

      const { width: pdfW, height: pdfH } = page.getSize();

      // Convert percentages → PDF points
      const sigW = coords.widthPct * pdfW;
      const sigH = coords.heightPct * pdfH;
      const sigX = coords.leftPct * pdfW;
      const sigY = pdfH - sigH - (coords.topPct * pdfH);

      // 3️⃣ Draw the signature
      page.drawImage(pngImage, {
        x: sigX,
        y: sigY,
        width: sigW,
        height: sigH,
      });

      // 4️⃣ Save final PDF
      const finalPdfBytes = await pdfDoc.save();
      const finalBase64 = Buffer.from(finalPdfBytes).toString("base64");

      return res.json({
        success: true,
        pdf: finalBase64,
      });
    });
  } catch (err) {
    console.error("sign-pdf error", err);
    res.status(500).json({ error: "Failed to sign PDF" });
  }
});

module.exports = router;
