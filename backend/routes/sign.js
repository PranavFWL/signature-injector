const express = require("express");
const router = express.Router();
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const crypto = require("crypto");

router.post("/sign-pdf", async (req, res) => {
  try {
    console.log("SIGN REQUEST RECEIVED:", req.body);

    const { pdfId, fields } = req.body;
    if (!pdfId || !Array.isArray(fields)) {
      return res.status(400).json({ error: "Missing pdfId or fields[]" });
    }

    const db = req.db;
    const gfs = req.gfs;
    const ObjectId = req.ObjectId;
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

        const originalHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

        const pdfDoc = await PDFDocument.load(pdfBuffer);

        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const pages = pdfDoc.getPages();

        console.log("========== Processing Fields ==========");
        console.log(`Total fields: ${fields.length}`);

        for (const f of fields) {
          try {
            if (!f || typeof f.pageIndex !== "number") continue;
            if (f.pageIndex < 0 || f.pageIndex >= pages.length) continue;

            const page = pages[f.pageIndex];
            const { width: pageWidth, height: pageHeight } = page.getSize();

            console.log(`\nField ${f.id} (${f.type}):`);
            console.log(`  Page dimensions: ${pageWidth} x ${pageHeight} points`);
            console.log(`  Field percentages: left=${f.leftPct}, top=${f.topPct}, width=${f.widthPct}, height=${f.heightPct}`);

            const fieldW = pageWidth * (f.widthPct || 0);
            const fieldH = pageHeight * (f.heightPct || 0);
            const fieldLeft = pageWidth * (f.leftPct || 0);
            const fieldTop = pageHeight * (f.topPct || 0);

            console.log(`  Absolute coords (PDF points): left=${fieldLeft}, top=${fieldTop}, width=${fieldW}, height=${fieldH}`);

            const fieldBottomY = pageHeight - (fieldTop + fieldH);

            console.log(`  PDF bottom-origin Y: ${fieldBottomY}`);
            if (f.type === "signature" || f.type === "image") {
              if (!f.value) {
                console.warn("field missing value (image):", f.id);
                continue;
              }

              let base64 = f.value;
              const commaIdx = base64.indexOf(",");
              if (commaIdx !== -1) base64 = base64.slice(commaIdx + 1);

              const imgBytes = Uint8Array.from(Buffer.from(base64, "base64"));

              let embeddedImage;
              try {
                embeddedImage = await pdfDoc.embedPng(imgBytes);
              } catch (e) {
                embeddedImage = await pdfDoc.embedJpg(imgBytes);
              }

              const imgW = embeddedImage.width;
              const imgH = embeddedImage.height;

              const paddingPoints = 5.33;
              const availableW = fieldW - (paddingPoints * 2);
              const availableH = fieldH - (paddingPoints * 2);

              const scale = Math.min(availableW / imgW, availableH / imgH);
              const drawW = imgW * scale;
              const drawH = imgH * scale;
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

            } else if (f.type === "text") {
              const text = (typeof f.value === "string" ? f.value : "") || "";

              const paddingPoints = 5.33;

              const defaultFontSize = 10;
              const maxFontSize = Math.min(defaultFontSize, fieldH * 0.6);
              let fontSize = maxFontSize;

              let textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
              const availableWidth = fieldW - (paddingPoints * 2);

              while (fontSize > 6 && textWidth > availableWidth) {
                fontSize -= 0.5;
                textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
              }

              const drawX = fieldLeft + paddingPoints;
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

            } else if (f.type === "date") {
              let dateStr = "";
              if (f.value && typeof f.value === "string" && f.value.trim() !== "") {
                dateStr = f.value;
              } else {
                const d = new Date();
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                const dd = String(d.getDate()).padStart(2, "0");
                dateStr = `${yyyy}-${mm}-${dd}`;
              }

              const paddingPoints = 5.33;

              const defaultFontSize = 10;
              const maxFontSize = Math.min(defaultFontSize, fieldH * 0.6);
              let fontSize = maxFontSize;
              let textWidth = helveticaFont.widthOfTextAtSize(dateStr, fontSize);
              const availableWidth = fieldW - (paddingPoints * 2);

              while (fontSize > 6 && textWidth > availableWidth) {
                fontSize -= 0.5;
                textWidth = helveticaFont.widthOfTextAtSize(dateStr, fontSize);
              }

              const drawX = fieldLeft + paddingPoints;
              const drawY = fieldBottomY + (fieldH / 2) - (fontSize / 3);

              page.drawText(dateStr, {
                x: drawX,
                y: drawY,
                size: fontSize,
                font: helveticaFont,
                maxWidth: availableWidth,
              });

              console.log(`Drew date '${f.id}' on page ${f.pageIndex} at`, { drawX, drawY, fontSize, fieldLeft, fieldTop, fieldW, fieldH });

            } else if (f.type === "radio") {
              const paddingPoints = 5.33;

              const circleR = 6.67;
              const cx = fieldLeft + paddingPoints + circleR;
              const cy = fieldBottomY + fieldH / 2;
              const innerR = circleR * 0.6;

              const blueColor = rgb(102/255, 126/255, 234/255);

              page.drawEllipse({
                x: cx,
                y: cy,
                xScale: circleR,
                yScale: circleR,
                borderColor: blueColor,
                borderWidth: 1.33,
              });

              if (f.selected) {
                page.drawEllipse({
                  x: cx,
                  y: cy,
                  xScale: innerR,
                  yScale: innerR,
                  color: blueColor,
                  borderWidth: 0,
                });
              }

              if (f.label) {
                const labelText = f.label || "Option";
                const defaultFontSize = 8;
                const maxFontSize = Math.min(defaultFontSize, fieldH * 0.6);
                let fontSize = maxFontSize;

                const labelX = cx + circleR + 5.33;
                const availableWidth = fieldW - (labelX - fieldLeft) - paddingPoints;

                let textWidth = helveticaFont.widthOfTextAtSize(labelText, fontSize);
                while (fontSize > 6 && textWidth > availableWidth) {
                  fontSize -= 0.5;
                  textWidth = helveticaFont.widthOfTextAtSize(labelText, fontSize);
                }

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
        }

        const signedPdfBytes = await pdfDoc.save();

        const uploadStream = gfs.openUploadStream("signed_" + pdfId + ".pdf");
        uploadStream.end(signedPdfBytes);

        uploadStream.on("error", (err) => {
          console.error("GridFS upload error:", err);
          return res.status(500).json({ error: "Failed to write signed PDF to GridFS" });
        });

        uploadStream.on("finish", async () => {
          const signedPdfId = uploadStream.id;

          const finalHash = crypto.createHash("sha256").update(Buffer.from(signedPdfBytes)).digest("hex");

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

          const pdfBase64 = Buffer.from(signedPdfBytes).toString("base64");
          const signedUrl = `/file/${signedPdfId}`;
          console.log("Signed PDF saved with ID:", signedPdfId.toString());
          return res.json({
            signedPdfId: signedPdfId.toString(),
            url: signedUrl,
            pdf: pdfBase64
          });
        });

      } catch (err) {
        console.error("sign-pdf processing error:", err);
        return res.status(500).json({ error: "PDF processing failed" });
      }
    });

  } catch (err) {
    console.error("sign-pdf error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

module.exports = router;
