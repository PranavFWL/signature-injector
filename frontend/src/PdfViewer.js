import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/webpack";
import FieldOverlay from "./FieldOverlay";

// PDF worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const PdfViewer = () => {




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
      const loadingTask = pdfjsLib.getDocument("/sample.pdf");
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
  if (!canvasRef.current) {
    console.error("Canvas not ready yet");
    return;
  }

  // 1️⃣ Get PDF image (temporary demo)
  const canvas = canvasRef.current;
  const pdfDataUrl = canvas.toDataURL("image/png");
  const pdfBase64 = pdfDataUrl.split(",")[1];

  // 2️⃣ TEMP signature (we will replace in Step 6)
  const placeholderSig = pdfBase64; // using same image just for testing

  // 3️⃣ Backend call
  const response = await fetch("http://localhost:5000/sign-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pdfBase64,
      signatureBase64: placeholderSig,
      coords: fieldData,
    }),
  });

  const result = await response.json();
  console.log("Backend returned:", result);
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
