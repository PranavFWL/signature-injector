import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/webpack";
import FieldOverlay from "./FieldOverlay";

// PDF worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const PdfViewer = () => {
  
  const [pdfBase64, setPdfBase64] = useState("");
  const signatureBase64 = pdfBase64; // TEMP: replace later
  

  // 1️⃣ State FIRST
  const [pdfSize, setPdfSize] = useState({ width: 0, height: 0 });
  const [fieldData, setFieldData] = useState({
    leftPct: 0,
    topPct: 0,
    widthPct: 0,
    heightPct: 0,
  });

  // 2️⃣ Handler SECOND
  const handleFieldPositionChange = (data) => {
    setFieldData((prev) => ({ ...prev, ...data }));
    console.log("Updated field data:", { ...fieldData, ...data });
  };

  // 3️⃣ Refs THIRD
  const canvasRef = useRef(null);

  // 4️⃣ useEffect FOURTH
  useEffect(() => {
    const loadPdf = async () => {
      // 1️⃣ Load the REAL PDF file as bytes
      const pdfBinary = await fetch("/sample.pdf").then((res) => res.arrayBuffer());

      // 2️⃣ Convert PDF bytes → base64
      const pdfBase64String = btoa(
      new Uint8Array(pdfBinary)
      .reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      setPdfBase64(pdfBase64String);

      // 3️⃣ Now use pdf.js to render the PDF in canvas
      const loadingTask = pdfjsLib.getDocument({ data: pdfBinary });

      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      const rotation = page.rotation || 0;

      const viewport = page.getViewport({
        scale: 1.5,
        rotation: rotation,
      });

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      const dpr = window.devicePixelRatio || 1;

      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;

      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      context.scale(dpr, dpr);

      setPdfSize({
        width: viewport.width,
        height: viewport.height,
      });

      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;
    };

    loadPdf();
  }, []);

  
  // 5️⃣ Important: Don't render overlay until pdfSize is set
  const pdfLoaded = pdfSize.width > 0 && pdfSize.height > 0;

  const handleSign = async () => {
  if (!pdfBase64) {
    console.error("PDF not loaded yet");
    return;
  }

  // 1️⃣ TEMP signature (will replace in Step 7)
  const signatureBase64 = pdfBase64;

  // 2️⃣ Backend call
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
  
  console.log("Backend returned:", result);

  // 3️⃣ Download final PDF
  const a = document.createElement("a");
  a.href = "data:application/pdf;base64," + result.pdf;
  a.download = "signed.pdf";
  a.click();
};



return (
  <div style={{ textAlign: "center" }}>

    {/* PDF Container */}
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

    {/* THE BUTTON SHOULD BE HERE */}
    <button
      onClick={handleSign}
      style={{
        marginTop: "20px",
        padding: "10px 20px",
        fontSize: "16px",
        cursor: "pointer",
      }}
    >
      Sign PDF (Test)
    </button>
  </div>
);

};

export default PdfViewer;
