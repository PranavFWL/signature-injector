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

  return (
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
  );
};

export default PdfViewer;
