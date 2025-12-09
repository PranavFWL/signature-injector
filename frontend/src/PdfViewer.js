import React, { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist/webpack';

const PdfViewer = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const loadPdf = async () => {
      const loadingTask = pdfjsLib.getDocument('/sample.pdf');
      const pdf = await loadingTask.promise;

      const page = await pdf.getPage(1);

      const viewport = page.getViewport({ scale: 1.5, rotation: page.rotation || 0 });

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      // NEW HIGH-DPI FIX
      const dpr = window.devicePixelRatio || 1;

      // Set REAL pixel size of canvas (internal resolution)
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;

      // Set CSS size (what the user visually sees)
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      // Scale drawing context so PDF renders sharply
      context.scale(dpr, dpr);

      const renderContext = {
      canvasContext: context,
      viewport: viewport,
      };

      await page.render(renderContext).promise;

    };

    loadPdf();
  }, []);

  return (
    <div style={{ textAlign: 'center', marginTop: '20px' }}>
      <canvas ref={canvasRef} style={{ border: '1px solid black' }} />
    </div>
  );
};

export default PdfViewer;
