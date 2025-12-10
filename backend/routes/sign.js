// backend/routes/sign.js
const express = require("express");
const router = express.Router();
const { PDFDocument } = require("pdf-lib");

router.post("/sign-pdf", async (req, res) => {
  try {
    console.log("SIGN REQUEST RECEIVED:", req.body);

    const db = req.db;
    const gfs = req.gfs;
    const ObjectId = req.ObjectId;

    const { pdfId, signatureBase64, coords } = req.body;

    if (!pdfId || !signatureBase64 || !coords) {
      return res.status(400).json({ error: "Missing required data" });
    }

    const { pageIndex, leftPct, topPct, widthPct, heightPct } = coords;

    // -----------------------------
    // 1) Read original PDF from GridFS
    // -----------------------------
    const fileStream = gfs.openDownloadStream(new ObjectId(pdfId));

    let pdfBuffer = Buffer.alloc(0);
    fileStream.on("data", (chunk) => {
      pdfBuffer = Buffer.concat([pdfBuffer, chunk]);
    });

    fileStream.on("error", (err) => {
      console.error("GridFS read error:", err);
      return res.status(500).json({ error: "Failed to read PDF" });
    });

    fileStream.on("end", async () => {
      try {
        // -----------------------------
        // 2) Load PDF + signature image
        // -----------------------------
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pages = pdfDoc.getPages();
        const page = pages[pageIndex];

        const sigBytes = Uint8Array.from(Buffer.from(signatureBase64, "base64"));
        const sigImage = await pdfDoc.embedPng(sigBytes);

        const { width, height } = page.getSize();

        // -----------------------------
        // 3) Convert % → absolute PDF px coords
        // HTML uses top-left origin.
        // PDF uses bottom-left origin.
        // -----------------------------
        const sigWidth = width * widthPct;
        const sigHeight = height * heightPct;

        const sigX = width * leftPct;
        const sigY = height - (height * topPct + sigHeight);

        console.log("Computed PDF placement:", {
          sigX,
          sigY,
          sigWidth,
          sigHeight,
          pageIndex,
        });

        // -----------------------------
        // 4) Draw image
        // -----------------------------
        page.drawImage(sigImage, {
          x: sigX,
          y: sigY,
          width: sigWidth,
          height: sigHeight,
        });

        // -----------------------------
        // 5) Save output PDF
        // -----------------------------
        const signedPdfBytes = await pdfDoc.save();

        // Save to GridFS as new file
        const uploadStream = gfs.openUploadStream("signed_" + pdfId + ".pdf");
        uploadStream.end(signedPdfBytes);

        uploadStream.on("finish", () => {
          console.log("Signed PDF saved with ID:", uploadStream.id);

          // Return base64 directly to frontend for download
          res.json({
            pdf: Buffer.from(signedPdfBytes).toString("base64"),
            signedPdfId: uploadStream.id,
          });
        });

      } catch (err) {
        console.error("sign-pdf processing error:", err);
        res.status(500).json({ error: "PDF processing failed" });
      }
    });

  } catch (err) {
    console.error("sign-pdf error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

module.exports = router;
