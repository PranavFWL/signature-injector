// backend/routes/sign.js
const express = require("express");
const router = express.Router();
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const crypto = require("crypto");

/**
 * Expected payload:
 * {
 *   pdfId: "<gridfs id string>",
 *   fields: [
 *     {
 *       id, type, pageIndex, leftPct, topPct, widthPct, heightPct, value
 *     },
 *     ...
 *   ]
 * }
 *
 * Behavior:
 * - Reads original PDF from GridFS
 * - Computes SHA-256 of original PDF
 * - Applies all fields to PDF:
 *     text/date -> draw text inside box
 *     signature/image -> embed image aspect-fit and center inside box
 *     radio -> draw circle, fill if value truthy, and draw editable label on right
 * - Computes SHA-256 of signed PDF
 * - Saves signed PDF to GridFS
 * - Writes audit record to MongoDB collection `audit_trail`
 * - Returns { signedPdfId, url } where url is a download endpoint on this server
 */

function bufferFromStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// aspect-fit calculation: returns { drawWidth, drawHeight, offsetX, offsetY }
function fitInsideBox(boxW, boxH, imgW, imgH) {
  const boxRatio = boxW / boxH;
  const imgRatio = imgW / imgH;

  let drawW, drawH;
  if (imgRatio > boxRatio) {
    // image wider: fit by width
    drawW = boxW;
    drawH = boxW / imgRatio;
  } else {
    // image taller or equal: fit by height
    drawH = boxH;
    drawW = boxH * imgRatio;
  }
  const offsetX = (boxW - drawW) / 2;
  const offsetY = (boxH - drawH) / 2;
  return { drawWidth: drawW, drawHeight: drawH, offsetX, offsetY };
}

router.post("/sign-pdf", async (req, res) => {
  try {
    console.log("SIGN REQUEST RECEIVED:", JSON.stringify(req.body).slice(0, 1000));

    const db = req.db; // mongo db instance
    const gfs = req.gfs; // GridFSBucket instance
    const ObjectId = req.ObjectId;

    const { pdfId, fields } = req.body;

    if (!pdfId || !fields || !Array.isArray(fields)) {
      return res.status(400).json({ error: "Missing pdfId or fields array" });
    }

    // 1) Read original PDF bytes from GridFS
    let downloadStream;
    try {
      downloadStream = gfs.openDownloadStream(new ObjectId(pdfId));
    } catch (err) {
      console.error("Invalid pdfId:", err);
      return res.status(400).json({ error: "Invalid pdfId" });
    }

    let originalPdfBuffer;
    try {
      originalPdfBuffer = await bufferFromStream(downloadStream);
    } catch (err) {
      console.error("GridFS read error:", err);
      return res.status(500).json({ error: "Failed to read PDF from GridFS" });
    }

    // 2) Compute hash BEFORE signing
    const originalHash = sha256Hex(originalPdfBuffer);

    // 3) Load PDF document
    const pdfDoc = await PDFDocument.load(originalPdfBuffer);
    const pages = pdfDoc.getPages();

    // Load fonts we'll use
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // For every page caching of its size
    const pageSizes = pages.map((p) => p.getSize());

    // 4) Process each field
    // fields: [{ id, type, pageIndex, leftPct, topPct, widthPct, heightPct, value }]
    for (const f of fields) {
      try {
        // Validate page index
        const pi = Number(f.pageIndex || 0);
        if (isNaN(pi) || pi < 0 || pi >= pages.length) {
          console.warn("Skipping field with bad pageIndex:", f);
          continue;
        }
        const page = pages[pi];
        const { width: pageW, height: pageH } = pageSizes[pi];

        // Convert % to PDF points:
        // frontend leftPct/topPct/widthPct/heightPct are relative to page CSS width/height (top-left origin).
        // PDF coordinate origin is bottom-left. So:
        //   x = pageW * leftPct
        //   y_top = pageH * topPct
        //   y = pageH - (y_top + boxHeight)
        const leftPct = Number(f.leftPct || 0);
        const topPct = Number(f.topPct || 0);
        const widthPct = Number(f.widthPct || 0);
        const heightPct = Number(f.heightPct || 0);

        const boxW = pageW * widthPct;
        const boxH = pageH * heightPct;
        const boxX = pageW * leftPct;
        const boxYTop = pageH * topPct;
        const boxY = pageH - (boxYTop + boxH); // bottom-left origin

        const padding = Math.max(2, boxH * 0.08); // small padding inside box

        // Branch by field type
        if (f.type === "signature" || f.type === "image") {
          // value should be base64 (without data: prefix)
          const base64 = f.value || "";
          if (!base64) {
            console.warn(`Field ${f.id} has no image data; skipping.`);
            continue;
          }

          // detect PNG vs JPEG by header bytes (first few base64 chars)
          const imgBytes = Uint8Array.from(Buffer.from(base64, "base64"));

          // embed image (pdf-lib determines format)
          let embeddedImage;
          try {
            // Attempt embedPng first, fallback to embedJpg
            // pdf-lib will throw if format doesn't match, so try both
            try {
              embeddedImage = await pdfDoc.embedPng(imgBytes);
            } catch (e) {
              embeddedImage = await pdfDoc.embedJpg(imgBytes);
            }
          } catch (err) {
            console.error("Failed to embed image for field", f.id, err);
            continue;
          }

          const imgDims = { width: embeddedImage.width, height: embeddedImage.height };
          const fit = fitInsideBox(boxW - 2 * padding, boxH - 2 * padding, imgDims.width, imgDims.height);

          const drawX = boxX + padding + fit.offsetX;
          const drawY = boxY + padding + fit.offsetY;
          const drawW = fit.drawWidth;
          const drawH = fit.drawHeight;

          page.drawImage(embeddedImage, {
            x: drawX,
            y: drawY,
            width: drawW,
            height: drawH,
          });
        } else if (f.type === "text" || f.type === "date") {
          // Render value inside box, wrap simply, auto font-size
          const value = f.value ?? "";
          // choose a font size relative to box height; clamp
          let fontSize = Math.min(24, Math.max(8, Math.floor((boxH - 2 * padding) * 0.6)));
          // If text is long, reduce font size
          const approxCharsPerLine = Math.max(10, Math.floor((boxW - 2 * padding) / (fontSize * 0.5)));
          const lines = [];
          if (!value) {
            // placeholder faint text for empty text boxes
            page.drawText("", { x: boxX + padding, y: boxY + boxH - padding - fontSize, size: fontSize, font: helveticaFont, color: rgb(0, 0, 0) });
          } else {
            // naive wrap: split by space
            const words = String(value).split(/\s+/);
            let line = "";
            for (const w of words) {
              if ((line + " " + w).trim().length <= approxCharsPerLine) {
                line = (line + " " + w).trim();
              } else {
                lines.push(line);
                line = w;
              }
            }
            if (line) lines.push(line);

            // if too many lines, reduce font-size
            while (lines.length * fontSize > (boxH - 2 * padding) && fontSize > 6) {
              fontSize -= 1;
            }

            // draw lines from top inside box
            let curY = boxY + boxH - padding - fontSize;
            for (const ln of lines) {
              page.drawText(ln, {
                x: boxX + padding,
                y: curY,
                size: fontSize,
                font: helveticaFont,
                color: rgb(0, 0, 0),
                maxWidth: boxW - 2 * padding,
              });
              curY -= fontSize + 2;
            }
          }
        } else if (f.type === "radio") {
          // Draw a radio circle and a label text to the right (editable). Only one radio per drag (frontend constraint).
          const isChecked = !!f.value; // truthy means selected
          const label = f.label ?? f.value ?? ""; // allow a label field; frontend can send label
          // circle radius relative to box height
          const radius = Math.max(6, Math.min(boxH * 0.18, 12));
          const centerX = boxX + padding + radius;
          const centerY = boxY + boxH / 2;

          // circle stroke
          page.drawCircle({
            x: centerX,
            y: centerY,
            size: radius,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
            color: undefined,
          });

          // filled inner dot if selected
          if (isChecked) {
            page.drawCircle({
              x: centerX,
              y: centerY,
              size: radius * 0.5,
              color: rgb(0, 0, 0),
            });
          }

          // draw label text to right
          if (label) {
            const fontSize = Math.max(8, Math.min(14, Math.floor(boxH * 0.28)));
            page.drawText(String(label), {
              x: centerX + radius + 6,
              y: centerY - fontSize / 2,
              size: fontSize,
              font: helveticaFont,
              color: rgb(0, 0, 0),
              maxWidth: boxW - (radius * 3 + 12),
            });
          }
        } else {
          console.warn("Unknown field type; skipping:", f.type);
        }
      } catch (errField) {
        console.error("Error processing field", f, errField);
      }
    } // end fields loop

    // 5) Save output PDF bytes
    const signedPdfBytes = await pdfDoc.save();

    // 6) Compute hash AFTER signing
    const signedHash = sha256Hex(Buffer.from(signedPdfBytes));

    // 7) Save signed PDF to GridFS
    const uploadName = `signed_${pdfId}.pdf`;
    const uploadStream = gfs.openUploadStream(uploadName);
    uploadStream.end(Buffer.from(signedPdfBytes));

    // Wait for finish
    await new Promise((resolve, reject) => {
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
    });

    const signedPdfId = uploadStream.id;

    // 8) Persist audit trail in MongoDB
    try {
      const audit = {
        originalPdfId: new ObjectId(pdfId),
        signedPdfId: signedPdfId,
        originalHash,
        signedHash,
        timestamp: new Date(),
        fields,
      };
      // Use collection name 'audit_trail'
      await db.collection("audit_trail").insertOne(audit);
    } catch (errAudit) {
      console.error("Failed to write audit trail:", errAudit);
      // don't fail the whole request; continue
    }

    // 9) Build a download URL for the signed PDF (assumes you have a route to serve GridFS files)
    // We'll try to build it from request host info. Adjust if your server uses a different download route.
    const protocol = req.protocol || "http";
    const host = req.get("host");
    // Example download path: /api/files/:id  -- adjust to your actual file-serving route if different
    const downloadUrl = `${protocol}://${host}/files/${signedPdfId}`;

    console.log("Signed PDF saved with ID:", signedPdfId);

    return res.json({
      signedPdfId,
      url: downloadUrl,
      pdf: Buffer.from(signedPdfBytes).toString("base64"), // still include base64 for front-end immediate download
      originalHash,
      signedHash,
    });
  } catch (err) {
    console.error("sign-pdf error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

module.exports = router;
