// backend/routes/sign.js
const express = require("express");
const router = express.Router();
const { PDFDocument, StandardFonts } = require("pdf-lib");
const crypto = require("crypto");

/**
 Expected POST /sign-pdf payload:
 {
   pdfId: "<GridFS ObjectId string of original PDF>",
   fields: [
     {
       id: "abc",
       type: "signature" | "image" | "text" | "date" | "radio",
       pageIndex: 0,
       leftPct: 0.42,
       topPct: 0.54,
       widthPct: 0.2239,
       heightPct: 0.0633,
       value: "<base64 image for signature/image OR text value>" 
     },
     ...
   ]
 }
*/
router.post("/sign-pdf", async (req, res) => {
  try {
    console.log("SIGN REQUEST RECEIVED:", req.body);

    const { pdfId, fields } = req.body;
    if (!pdfId || !Array.isArray(fields)) {
      return res.status(400).json({ error: "Missing pdfId or fields[]" });
    }

    const db = req.db;           // injected in server.js middleware
    const gfs = req.gfs;         // injected GridFSBucket instance
    const ObjectId = req.ObjectId;

    // -------------- 1) Read original PDF from GridFS ----------------
    const downloadStream = gfs.openDownloadStream(new ObjectId(pdfId));
    let chunks = [];
    downloadStream.on("data", (c) => chunks.push(c));
    downloadStream.on("error", (err) => {
      console.error("GridFS read error:", err);
      return res.status(500).json({ error: "Failed to read PDF from GridFS" });
    });

    downloadStream.on("end", async () => {
      try {
        const pdfBuffer = Buffer.concat(chunks);

        // -------------- 2) Compute original SHA-256 ------------------
        const originalHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

        // -------------- 3) Load into pdf-lib ------------------------
        const pdfDoc = await PDFDocument.load(pdfBuffer);

        // embed a standard font for text rendering
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const pages = pdfDoc.getPages();

        // -------------- 4) Process fields ---------------------------
        for (const f of fields) {
          try {
            // safety checks
            if (!f || typeof f.pageIndex !== "number") continue;
            if (f.pageIndex < 0 || f.pageIndex >= pages.length) continue;

            const page = pages[f.pageIndex];
            const { width: pageWidth, height: pageHeight } = page.getSize();

            // absolute box on PDF points
            const fieldW = pageWidth * (f.widthPct || 0);
            const fieldH = pageHeight * (f.heightPct || 0);
            const fieldLeft = pageWidth * (f.leftPct || 0);
            const fieldTop = pageHeight * (f.topPct || 0); // top in CSS coords

            // convert top-left (CSS) into PDF bottom-left origin
            const fieldBottomY = pageHeight - (fieldTop + fieldH);

            // --- IMAGE or SIGNATURE (contain, preserve aspect) ---
            if (f.type === "signature" || f.type === "image") {
              if (!f.value) {
                console.warn("field missing value (image):", f.id);
                continue;
              }

              // accept either "data:<mime>;base64,..." or raw base64
              let base64 = f.value;
              const commaIdx = base64.indexOf(",");
              if (commaIdx !== -1) base64 = base64.slice(commaIdx + 1);

              const imgBytes = Uint8Array.from(Buffer.from(base64, "base64"));

              // try embed PNG then JPG
              let embeddedImage;
              try {
                embeddedImage = await pdfDoc.embedPng(imgBytes);
              } catch (e) {
                embeddedImage = await pdfDoc.embedJpg(imgBytes);
              }

              const imgW = embeddedImage.width;
              const imgH = embeddedImage.height;

              const scale = Math.min(fieldW / imgW, fieldH / imgH);
              const drawW = imgW * scale;
              const drawH = imgH * scale;
              const drawX = fieldLeft + (fieldW - drawW) / 2;
              const drawY = fieldBottomY + (fieldH - drawH) / 2;

              page.drawImage(embeddedImage, {
                x: drawX,
                y: drawY,
                width: drawW,
                height: drawH,
              });

              console.log(`Drew ${f.type} '${f.id}' on page ${f.pageIndex} at`, {
                drawX, drawY, drawW, drawH,
              });

            // --- TEXT ---
            } else if (f.type === "text") {
              const text = (typeof f.value === "string" ? f.value : "") || "";

              // start with a max font size that's reasonable relative to the box height
              const maxFontSize = Math.min(24, fieldH * 0.8); // never huge
              let fontSize = maxFontSize;

              // measure and shrink fontSize until it fits horizontally (simple loop)
              let textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
              if (textWidth > fieldW - 6) { // small padding
                // reduce font until it fits, but don't go below 6
                while (fontSize > 6 && helveticaFont.widthOfTextAtSize(text, fontSize) > fieldW - 6) {
                  fontSize -= 1;
                }
                textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
              }

              // vertical centering
              const textHeight = fontSize; // approx
              const drawX = fieldLeft + (fieldW - textWidth) / 2;
              const drawY = fieldBottomY + (fieldH - textHeight) / 2;

              page.drawText(text, {
                x: drawX,
                y: drawY,
                size: fontSize,
                font: helveticaFont,
                maxWidth: fieldW - 6,
              });

              console.log(`Drew text '${f.id}' on page ${f.pageIndex} at`, {
                drawX, drawY, fontSize, textWidth,
              });

            // --- DATE ---
            } else if (f.type === "date") {
              let dateStr = "";
              if (f.value && typeof f.value === "string" && f.value.trim() !== "") {
                dateStr = f.value;
              } else {
                // default format YYYY-MM-DD
                const d = new Date();
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                const dd = String(d.getDate()).padStart(2, "0");
                dateStr = `${yyyy}-${mm}-${dd}`;
              }

              const maxFontSize = Math.min(18, fieldH * 0.7);
              let fontSize = maxFontSize;
              let textWidth = helveticaFont.widthOfTextAtSize(dateStr, fontSize);
              while (fontSize > 6 && textWidth > fieldW - 6) {
                fontSize -= 1;
                textWidth = helveticaFont.widthOfTextAtSize(dateStr, fontSize);
              }

              const textHeight = fontSize;
              const drawX = fieldLeft + 4; // left aligned with small padding
              const drawY = fieldBottomY + (fieldH - textHeight) / 2;

              page.drawText(dateStr, {
                x: drawX,
                y: drawY,
                size: fontSize,
                font: helveticaFont,
                maxWidth: fieldW - 6,
              });

              console.log(`Drew date '${f.id}' on page ${f.pageIndex} at`, { drawX, drawY, fontSize });

            // --- RADIO ---
            } else if (f.type === "radio") {
              // Draw a circle centered in the field box. If f.value is truthy, fill a smaller dot.
              const cx = fieldLeft + fieldW / 2;
              const cy = fieldBottomY + fieldH / 2;
              const outerR = Math.min(fieldW, fieldH) * 0.4; // radius relative to box
              const innerR = outerR * 0.55;

              // pdf-lib doesn't have direct circle primitive; use drawEllipse
              page.drawEllipse({
                x: cx,
                y: cy,
                xScale: outerR,
                yScale: outerR,
                borderWidth: 1,
              });

              // if value indicates checked (truthy string "checked" or boolean true)
              if (f.value) {
                page.drawEllipse({
                  x: cx,
                  y: cy,
                  xScale: innerR,
                  yScale: innerR,
                  color: undefined, // use default (black) fill
                  borderWidth: 0,
                  opacity: 1,
                });
              }

              console.log(`Drew radio '${f.id}' on page ${f.pageIndex} at`, { cx, cy, outerR, innerR });

            } else {
              console.log("Unknown field.type (skipping):", f.type, f.id);
            }
          } catch (innerErr) {
            console.error("Error processing single field:", f && f.id, innerErr);
          }
        } // end for fields

        // -------------- 5) Save signed PDF -------------------------
        const signedPdfBytes = await pdfDoc.save();

        // -------------- 6) Save to GridFS -------------------------
        const uploadStream = gfs.openUploadStream("signed_" + pdfId + ".pdf");
        uploadStream.end(signedPdfBytes);

        uploadStream.on("error", (err) => {
          console.error("GridFS upload error:", err);
          return res.status(500).json({ error: "Failed to write signed PDF to GridFS" });
        });

        uploadStream.on("finish", async () => {
          const signedPdfId = uploadStream.id;

          // -------------- 7) Compute final SHA-256 ----------------
          const finalHash = crypto.createHash("sha256").update(Buffer.from(signedPdfBytes)).digest("hex");

          // -------------- 8) Insert audit record -------------------
          try {
            const audit = {
              pdfId: new ObjectId(pdfId),
              signedPdfId,
              originalHash,
              finalHash,
              fieldsProcessed: fields.map((ff) => ({ id: ff.id, type: ff.type, pageIndex: ff.pageIndex })),
              createdAt: new Date(),
            };
            await db.collection("audits").insertOne(audit);
          } catch (auditErr) {
            console.error("Failed to write audit record:", auditErr);
          }

          // -------------- 9) Respond with signed PDF id + URL -----------
          const signedUrl = `/file/${signedPdfId}`; // ensure your server has this route
          console.log("Signed PDF saved with ID:", signedPdfId.toString());
          return res.json({ signedPdfId: signedPdfId.toString(), url: signedUrl });
        });

      } catch (err) {
        console.error("sign-pdf processing error:", err);
        return res.status(500).json({ error: "PDF processing failed" });
      }
    }); // end downloadStream.on('end')

  } catch (err) {
    console.error("sign-pdf error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

module.exports = router;
