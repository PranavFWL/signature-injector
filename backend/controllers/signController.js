const { PDFDocument } = require("pdf-lib");

exports.signPdf = async (req, res) => {
  try {
    const { pdfBase64, signatureBase64, coords } = req.body;

    const { leftPct, topPct, widthPct, heightPct } = coords;

    const pdfBytes = Buffer.from(pdfBase64, "base64");
    const pdfDoc = await PDFDocument.load(pdfBytes);

    const page = pdfDoc.getPages()[0];
    const { width: pdfWidth, height: pdfHeight } = page.getSize();

    const signatureBytes = Buffer.from(signatureBase64, "base64");
    const signatureImage = await pdfDoc.embedPng(signatureBytes);

    const sigWidth = pdfWidth * widthPct;
    const sigHeight = pdfHeight * heightPct;

    const x = leftPct * pdfWidth;
    const y = pdfHeight - (topPct * pdfHeight) - sigHeight;

    page.drawImage(signatureImage, {
      x,
      y,
      width: sigWidth,
      height: sigHeight,
    });

    const modifiedPdfBytes = await pdfDoc.save();
    const finalPdfBase64 = Buffer.from(modifiedPdfBytes).toString("base64");

    res.json({
      success: true,
      pdf: finalPdfBase64,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PDF signing failed" });
  }
};
