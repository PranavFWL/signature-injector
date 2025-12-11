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
        console.log("========== Processing Fields ==========");
        console.log(`Total fields: ${fields.length}`);

        for (const f of fields) {
          try {
            // safety checks
            if (!f || typeof f.pageIndex !== "number") continue;
            if (f.pageIndex < 0 || f.pageIndex >= pages.length) continue;

            const page = pages[f.pageIndex];
            const { width: pageWidth, height: pageHeight } = page.getSize();

            console.log(`\nField ${f.id} (${f.type}):`);
            console.log(`  Page dimensions: ${pageWidth} x ${pageHeight} points`);
            console.log(`  Field percentages: left=${f.leftPct}, top=${f.topPct}, width=${f.widthPct}, height=${f.heightPct}`);

            // absolute box on PDF points
            const fieldW = pageWidth * (f.widthPct || 0);
            const fieldH = pageHeight * (f.heightPct || 0);
            const fieldLeft = pageWidth * (f.leftPct || 0);
            const fieldTop = pageHeight * (f.topPct || 0); // top in CSS coords

            console.log(`  Absolute coords (PDF points): left=${fieldLeft}, top=${fieldTop}, width=${fieldW}, height=${fieldH}`);

            // convert top-left (CSS) into PDF bottom-left origin
            const fieldBottomY = pageHeight - (fieldTop + fieldH);

            console.log(`  PDF bottom-origin Y: ${fieldBottomY}`);

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

              // Frontend has 8px total padding (4+4) at scale 1.5 = 5.33 PDF points
              const paddingPoints = 5.33;
              const availableW = fieldW - (paddingPoints * 2);
              const availableH = fieldH - (paddingPoints * 2);

              const scale = Math.min(availableW / imgW, availableH / imgH);
              const drawW = imgW * scale;
              const drawH = imgH * scale;
              // Center within the padded area
              const drawX = fieldLeft + paddingPoints + (availableW - drawW) / 2;
              const drawY = fieldBottomY + paddingPoints + (availableH - drawH) / 2;

              page.drawImage(embeddedImage, {
                x: drawX,
                y: drawY,
                width: drawW,
                height: drawH,
              });

              console.log(`Drew ${f.type} '${f.id}' on page ${f.pageIndex} at`, {
                drawX, drawY, drawW, drawH, fieldLeft, fieldTop, fieldW, fieldH,
              });

            // --- TEXT ---
            } else if (f.type === "text") {
              const text = (typeof f.value === "string" ? f.value : "") || "";

              // Frontend has 8px total padding (4+4) at scale 1.5 = 5.33 PDF points
              const paddingPoints = 5.33;

              // Default input font is ~13-14px at scale 1.5 = ~9-10 PDF points
              const defaultFontSize = 10;
              const maxFontSize = Math.min(defaultFontSize, fieldH * 0.6);
              let fontSize = maxFontSize;

              // measure and shrink fontSize until it fits horizontally
              let textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
              const availableWidth = fieldW - (paddingPoints * 2);

              while (fontSize > 6 && textWidth > availableWidth) {
                fontSize -= 0.5;
                textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
              }

              // Left-aligned with padding (matching frontend input behavior)
              const drawX = fieldLeft + paddingPoints;
              // Vertical centering - account for baseline position
              const drawY = fieldBottomY + (fieldH / 2) - (fontSize / 3);

              page.drawText(text, {
                x: drawX,
                y: drawY,
                size: fontSize,
                font: helveticaFont,
                maxWidth: availableWidth,
              });

              console.log(`Drew text '${f.id}' on page ${f.pageIndex} at`, {
                drawX, drawY, fontSize, textWidth, fieldLeft, fieldTop, fieldW, fieldH,
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

              // Frontend has 8px total padding (4+4) at scale 1.5 = 5.33 PDF points
              const paddingPoints = 5.33;

              // Default input font is ~13-14px at scale 1.5 = ~9-10 PDF points
              const defaultFontSize = 10;
              const maxFontSize = Math.min(defaultFontSize, fieldH * 0.6);
              let fontSize = maxFontSize;
              let textWidth = helveticaFont.widthOfTextAtSize(dateStr, fontSize);
              const availableWidth = fieldW - (paddingPoints * 2);

              while (fontSize > 6 && textWidth > availableWidth) {
                fontSize -= 0.5;
                textWidth = helveticaFont.widthOfTextAtSize(dateStr, fontSize);
              }

              // Left-aligned with padding
              const drawX = fieldLeft + paddingPoints;
              // Vertical centering - account for baseline position
              const drawY = fieldBottomY + (fieldH / 2) - (fontSize / 3);

              page.drawText(dateStr, {
                x: drawX,
                y: drawY,
                size: fontSize,
                font: helveticaFont,
                maxWidth: availableWidth,
              });

              console.log(`Drew date '${f.id}' on page ${f.pageIndex} at`, { drawX, drawY, fontSize, fieldLeft, fieldTop, fieldW, fieldH });

            // --- RADIO ---
            } else if (f.type === "radio") {
              // Draw a circle and label. If f.selected is true, fill the inner circle.
              const paddingPoints = 5.33;

              // Circle size: 20px in frontend / 1.5 = 13.33 points diameter
              const circleR = 6.67; // radius
              const cx = fieldLeft + paddingPoints + circleR; // position circle on left with padding
              const cy = fieldBottomY + fieldH / 2;
              const innerR = circleR * 0.6;

              // Draw outer circle
              page.drawEllipse({
                x: cx,
                y: cy,
                xScale: circleR,
                yScale: circleR,
                borderWidth: 1.33, // 2px / 1.5 = 1.33 points
              });

              // If selected, fill inner circle
              if (f.selected) {
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

              // Draw label text next to the circle
              if (f.label) {
                const labelText = f.label || "Option";
                // Frontend font is 0.9rem = ~12px / 1.5 = ~8 points
                const defaultFontSize = 8;
                const maxFontSize = Math.min(defaultFontSize, fieldH * 0.6);
                let fontSize = maxFontSize;

                // Position label to the right of circle with 8px gap = 5.33 points
                const labelX = cx + circleR + 5.33;
                const availableWidth = fieldW - (labelX - fieldLeft) - paddingPoints;

                let textWidth = helveticaFont.widthOfTextAtSize(labelText, fontSize);
                while (fontSize > 6 && textWidth > availableWidth) {
                  fontSize -= 0.5;
                  textWidth = helveticaFont.widthOfTextAtSize(labelText, fontSize);
                }

                // Vertically center with circle
                const labelY = cy - fontSize / 3;

                page.drawText(labelText, {
                  x: labelX,
                  y: labelY,
                  size: fontSize,
                  font: helveticaFont,
                  maxWidth: availableWidth,
                });
              }

              console.log(`Drew radio '${f.id}' on page ${f.pageIndex} at`, { cx, cy, circleR, innerR, selected: f.selected });

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

          // -------------- 9) Respond with signed PDF as base64 -----------
          const pdfBase64 = Buffer.from(signedPdfBytes).toString("base64");
          const signedUrl = `/file/${signedPdfId}`; // ensure your server has this route
          console.log("Signed PDF saved with ID:", signedPdfId.toString());
          return res.json({
            signedPdfId: signedPdfId.toString(),
            url: signedUrl,
            pdf: pdfBase64  // Send base64 PDF for direct download
          });
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
