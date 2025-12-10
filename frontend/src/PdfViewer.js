import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/webpack";
import FieldOverlay from "./FieldOverlay";
import SignaturePad from "./SignaturePad";   // <-- IMPORTANT

// PDF worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const PdfViewer = () => {

  // 1️⃣ ALL HOOKS AT TOP
  const [pdfBase64, setPdfBase64] = useState("");
  const [pdfSize, setPdfSize] = useState({ width: 0, height: 0 });
  const [fieldData, setFieldData] = useState({
    leftPct: 0,
    topPct: 0,
    widthPct: 0,
    heightPct: 0,
  });

  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureBase64, setSignatureBase64] = useState("");

  const canvasRef = useRef(null);

  // 2️⃣ HANDLERS
  const openSignaturePad = () => setShowSignaturePad(true);
  const closeSignaturePad = () => setShowSignaturePad(false);

  const saveSignature = (dataURL) => {
    const cleaned = dataURL.split(",")[1];
    setSignatureBase64(cleaned);
    setShowSignaturePad(false);
  };

  const handleFieldPositionChange = (data) => {
    setFieldData((prev) => ({ ...prev, ...data }));
  };

  // 3️⃣ LOAD REAL PDF
  useEffect(() => {
    const loadPdf = async () => {
      const pdfBinary = await fetch("/sample.pdf").then((res) =>
        res.arrayBuffer()
      );

      const pdfBase64String = btoa(
        new Uint8Array(pdfBinary).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      setPdfBase64(pdfBase64String);

      const loadingTask = pdfjsLib.getDocument({ data: pdfBinary });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      const viewport = page.getViewport({ scale: 1.5 });

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;

      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      context.scale(dpr, dpr);

      setPdfSize({ width: viewport.width, height: viewport.height });

      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;
    };

    loadPdf();
  }, []);

  // 4️⃣ SIGN PDF
  const handleSign = async () => {
    if (!pdfBase64) return console.error("PDF not loaded yet");
    if (!signatureBase64)
      return console.error("Signature missing");

    const response = await fetch("http://localhost:5000/sign-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfBase64,
        signatureBase64,
        coords: fieldData,
      }),
    });

    const result = await response.json();

    const a = document.createElement("a");
    a.href = "data:application/pdf;base64," + result.pdf;
    a.download = "signed.pdf";
    a.click();
  };

  const pdfLoaded = pdfSize.width > 0;

  // 5️⃣ UI
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          position: "relative",
          width: pdfSize.width,
          height: pdfSize.height,
          margin: "30px auto",
          border: "1px solid #ddd",
        }}
      >
        <canvas ref={canvasRef} />

        {pdfLoaded && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: pdfSize.width,
              height: pdfSize.height,
              pointerEvents: "none",
            }}
          >
            <div style={{ pointerEvents: "auto", width: "100%", height: "100%" }}>
              <FieldOverlay
                onChangePosition={handleFieldPositionChange}
                pdfWidth={pdfSize.width}
                pdfHeight={pdfSize.height}
              />
            </div>
          </div>
        )}
      </div>

      <button
        onClick={openSignaturePad}
        style={{ marginTop: 20, marginRight: 10 }}
      >
        Draw Signature
      </button>

      <button
        onClick={handleSign}
        disabled={!signatureBase64}
      >
        Sign PDF
      </button>

      {showSignaturePad && (
        <SignaturePad onSave={saveSignature} onClose={closeSignaturePad} />
      )}
    </div>
  );
};

export default PdfViewer;
