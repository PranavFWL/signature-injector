import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/webpack";
import FieldOverlay from "./FieldOverlay";

// PDF worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const PdfViewer = () => {
  const canvasRef = useRef(null);
  const [pdfSize, setPdfSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const loadPdf = async () => {
      const loadingTask = pdfjsLib.getDocument("/sample.pdf");
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      // FIX: correct rotation
      const rotation = page.rotation || 0;

      // FIX: choose scale
      const viewport = page.getViewport({
        scale: 1.5,
        rotation: rotation,
      });

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      // FIX: High DPI clarity
      const dpr = window.devicePixelRatio || 1;

      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;

      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      context.scale(dpr, dpr);

      // Save PDF size for overlay
      setPdfSize({
        width: viewport.width,
        height: viewport.height,
      });

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
    };

    loadPdf();
  }, []);

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
      {/* Canvas */}
      <canvas ref={canvasRef} />

      {/* Overlay (must match EXACT canvas size) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: pdfSize.width,
          height: pdfSize.height,
          pointerEvents: "none", // Do not block canvas
        }}
      >
        {/* Only this div accepts pointer events */}
        <div style={{ pointerEvents: "auto", width: "100%", height: "100%" }}>
          <FieldOverlay />
        </div>
      </div>
    </div>
  );
};

export default PdfViewer;
