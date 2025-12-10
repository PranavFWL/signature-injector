import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/webpack";
import FieldOverlay from "./FieldOverlay";
import SignaturePad from "./SignaturePad";

// PDF worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const PdfViewer = () => {

  const [pdfBase64, setPdfBase64] = useState("");
  const [originalFileName, setOriginalFileName] = useState("sample.pdf");

  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureBase64, setSignatureBase64] = useState("");

  const [pdfSize, setPdfSize] = useState({ width: 0, height: 0 });
  const [fieldData, setFieldData] = useState({
    leftPct: 0,
    topPct: 0,
    widthPct: 0,
    heightPct: 0
  });

  const canvasRef = useRef(null);

  const openSignaturePad = () => setShowSignaturePad(true);
  const closeSignaturePad = () => setShowSignaturePad(false);

  const saveSignature = (dataURL) => {
    const cleaned = dataURL.split(",")[1];
    setSignatureBase64(cleaned);
    setShowSignaturePad(false);
  };

  const handleFieldPositionChange = (data) => {
    setFieldData((prev) => ({ ...prev, ...data }));
    console.log("Updated field data:", { ...fieldData, ...data });
  };

  const renderPdfToCanvas = async (pdfBinary) => {
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

  setPdfSize({
    width: viewport.width,
    height: viewport.height,
  });

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;
  };


useEffect(() => {
  const loadDefaultPdf = async () => {
    const pdfBinary = await fetch("/sample.pdf").then(res => res.arrayBuffer());
    setOriginalFileName("sample");

    const pdfBase64String = btoa(
      new Uint8Array(pdfBinary).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    setPdfBase64(pdfBase64String);
    renderPdfToCanvas(pdfBinary);
  };

  loadDefaultPdf();
  }, []);


  const handlePdfUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  setOriginalFileName(file.name.replace(".pdf", ""));

  const arrayBuffer = await file.arrayBuffer();

  // Convert to base64 for backend
  const pdfBase64String = btoa(
    new Uint8Array(arrayBuffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      ""
    )
  );

  setPdfBase64(pdfBase64String);

  // Clear previous signature
  setSignatureBase64("");
  setFieldData({
    leftPct: 0,
    topPct: 0,
    widthPct: 0,
    heightPct: 0,
  });

  // Now render PDF on canvas
  renderPdfToCanvas(arrayBuffer);
  };


  const handleSign = async () => {
    if (!signatureBase64) {
      alert("Please draw your signature first.");
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
    console.log("Backend returned:", result);

    // Create final file name
    const signedName = `${originalFileName}_Signed.pdf`;

    // Download
    const a = document.createElement("a");
    a.href = "data:application/pdf;base64," + result.pdf;
    a.download = signedName;
    a.click();
  };

  return (
    <div style={{ textAlign: "center" }}>

      {/* PDF Viewer */}

      <input
      type="file"
      accept="application/pdf"
      onChange={handlePdfUpload}
      style={{ marginTop: "20px" }}
      />

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

      {/* Buttons */}
      <button onClick={openSignaturePad}
        style={{ marginRight: "10px", marginTop: "20px", padding: "10px", fontSize: "16px" }}>
        Draw Signature
      </button>

      <button onClick={handleSign}
        disabled={!signatureBase64}
        style={{ marginTop: "20px", padding: "10px", fontSize: "16px" }}>
        Sign PDF
      </button>

      {/* Signature Pad */}
      {showSignaturePad && (
        <SignaturePad onSave={saveSignature} onClose={closeSignaturePad} />
      )}
    </div>
  );
};

export default PdfViewer;
