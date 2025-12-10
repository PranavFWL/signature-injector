// frontend/src/PdfViewer.js
import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/webpack";
import FieldOverlay from "./FieldOverlay";
import SignaturePad from "./SignaturePad";

// PDF worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const PdfViewer = () => {
  // ========= STATES =========
  const [pdfBase64, setPdfBase64] = useState("");
  const [originalFileName, setOriginalFileName] = useState("sample");

  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureBase64, setSignatureBase64] = useState("");

  const [pdfSize, setPdfSize] = useState({ width: 500, height: 700 }); // default size
  const [fieldData, setFieldData] = useState({
    leftPct: 0,
    topPct: 0,
    widthPct: 0,
    heightPct: 0,
  });

  const canvasRef = useRef(null);

  // ========= SIGNATURE PAD =========
  const openSignaturePad = () => setShowSignaturePad(true);
  const closeSignaturePad = () => setShowSignaturePad(false);

  const saveSignature = (dataURL) => {
    const cleaned = dataURL.split(",")[1];
    setSignatureBase64(cleaned);
    setShowSignaturePad(false);
  };

  // ========= HANDLE FIELD MOVEMENT =========
  const handleFieldPositionChange = (data) => {
    setFieldData((prev) => ({ ...prev, ...data }));
    console.log("Updated field data:", { ...fieldData, ...data });
  };

  // ========= RENDER PDF SAFELY =========
  const renderPdf = async (pdfBinary) => {
    // Retry if canvas not ready
    if (!canvasRef.current) {
      console.warn("Canvas not ready, retrying...");
      setTimeout(() => renderPdf(pdfBinary), 50);
      return;
    }

    const loadingTask = pdfjsLib.getDocument({ data: pdfBinary });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const dpr = window.devicePixelRatio || 1;

    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;

    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    setPdfSize({
      width: viewport.width,
      height: viewport.height,
    });

    await page.render({ canvasContext: ctx, viewport }).promise;
  };

 
  // ========= PDF UPLOAD HANDLER =========
  const handlePdfUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setOriginalFileName(file.name.replace(".pdf", ""));

    const arrayBuffer = await file.arrayBuffer();

    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (acc, b) => acc + String.fromCharCode(b),
        ""
      )
    );

    setPdfBase64(base64);

    setSignatureBase64("");
    setFieldData({
      leftPct: 0,
      topPct: 0,
      widthPct: 0,
      heightPct: 0,
    });

    setTimeout(() => {
      renderPdf(arrayBuffer);
    }, 0);
  };

  // ========= SIGN PDF =========
  const handleSign = async () => {
    if (!signatureBase64) {
      alert("Draw a signature first.");
      return;
    }

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

    const finalName = `${originalFileName}_Signed.pdf`;

    const a = document.createElement("a");
    a.href = "data:application/pdf;base64," + result.pdf;
    a.download = finalName;
    a.click();
  };

  return (
    <div style={{ textAlign: "center" }}>
      {/* Upload PDF */}
      <input
        type="file"
        accept="application/pdf"
        onChange={handlePdfUpload}
        style={{ marginTop: "20px" }}
      />

      {pdfBase64 !== "" && (
  <div
    style={{
      position: "relative",
      width: pdfSize.width,
      height: pdfSize.height,
      margin: "30px auto",
      border: "1px solid #ccc",
    }}
  >
    <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />

    {/* SHOW SIGNATURE BOX ONLY AFTER USER DRAWS SIGNATURE */}
    {signatureBase64 && pdfSize.width > 0 && (
      <FieldOverlay
        onChangePosition={handleFieldPositionChange}
        pdfWidth={pdfSize.width}
        pdfHeight={pdfSize.height}
        signatureBase64={signatureBase64}
      />
    )}
  </div>
)}


      {/* Action Buttons */}
      {pdfBase64 !== "" && (
  <div style={{ marginTop: "20px" }}>
    <button
      onClick={openSignaturePad}
      style={{
        marginRight: "10px",
        padding: "12px 24px",
        fontSize: "18px",
        borderRadius: "8px",
        cursor: "pointer",
      }}
    >
      Draw Signature
    </button>

    <button
      onClick={handleSign}
      disabled={!signatureBase64}
      style={{
        padding: "12px 24px",
        fontSize: "18px",
        borderRadius: "8px",
        cursor: "pointer",
      }}
    >
      Download PDF
    </button>
  </div>
)}


      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <SignaturePad onSave={saveSignature} onClose={closeSignaturePad} />
      )}
    </div>
  );
};

export default PdfViewer;
