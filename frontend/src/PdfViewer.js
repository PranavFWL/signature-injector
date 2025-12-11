import React, { useState, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist/webpack";
import FieldOverlay from "./FieldOverlay";
import SignaturePad from "./SignaturePad";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function PdfViewer() {
  const [pdfId, setPdfId] = useState("");
  const [pagesMeta, setPagesMeta] = useState([]);
  const canvasRefs = useRef([]);

  const [tool, setTool] = useState(null);
  const [fields, setFields] = useState([]);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureTargetId, setSignatureTargetId] = useState(null);

  const renderAllPages = async (pdfBinary) => {
    console.log("renderAllPages — start");
    const loadingTask = pdfjsLib.getDocument({ data: pdfBinary });
    const pdf = await loadingTask.promise;
    const total = pdf.numPages;
    console.log("pdf pages:", total);

    const meta = [];
    canvasRefs.current = new Array(total).fill(null);

    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1.5 });
      meta.push({ width: vp.width, height: vp.height });
    }
    setPagesMeta(meta);

    setTimeout(async () => {
      for (let i = 1; i <= total; i++) {
        await renderPage(pdf, i);
      }
    }, 30);
  };

  const renderPage = async (pdf, pageNum) => {
    const canvas = canvasRefs.current[pageNum - 1];
    if (!canvas) {
      console.warn("renderPage: canvas missing for", pageNum);
      return;
    }
    const page = await pdf.getPage(pageNum);
    const vp = page.getViewport({ scale: 1.5 });
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    canvas.width = vp.width * dpr;
    canvas.height = vp.height * dpr;
    canvas.style.width = vp.width + "px";
    canvas.style.height = vp.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    console.log("rendered page", pageNum);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    console.log("selected file:", file.name);

    const arrayBuffer = await file.arrayBuffer();

    renderAllPages(arrayBuffer);

    try {
      const fd = new FormData();
      fd.append("file", new Blob([arrayBuffer], { type: "application/pdf" }), file.name);
      const res = await fetch("https://signature-injector-4.onrender.com/sign-pdf", { method: "POST", body: fd });
      const data = await res.json();
      console.log("upload response:", data);
      if (!res.ok) {
        alert("Upload failed. Check backend logs.");
        return;
      }
      setPdfId(data.pdfId);
    } catch (err) {
      console.error("upload error", err);
      alert("Upload failed (network). See console.");
    }
  };

  const handlePageClick = (e, pageIndex) => {
    if (!tool) return;
    const meta = pagesMeta[pageIndex];
    if (!meta) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    const leftPct = xPx / meta.width;
    const topPct = yPx / meta.height;
    const widthPct = Math.min(0.3, 0.25);
    const heightPct = 0.08;

    const id = Math.random().toString(36).slice(2, 9);
    const newField = {
      id,
      type: tool,
      pageIndex,
      leftPct: clamp(leftPct - widthPct / 2, 0, 1 - widthPct),
      topPct: clamp(topPct - heightPct / 2, 0, 1 - heightPct),
      widthPct,
      heightPct,
      value: "",
    };

    console.log("placing field", newField);
    setFields((prev) => [...prev, newField]);

    if (tool === "signature") {
      setSignatureTargetId(id);
      setShowSignaturePad(true);
    }

    setTool(null);
  };

  const handleSignatureSave = (dataURL) => {
    if (!signatureTargetId) {
      console.warn("no target for signature");
      setShowSignaturePad(false);
      return;
    }
    const base64 = dataURL.split(",")[1];
    setFields((prev) => prev.map((f) => (f.id === signatureTargetId ? { ...f, value: base64 } : f)));
    setShowSignaturePad(false);
    setSignatureTargetId(null);
  };

  const handleFieldChange = (id, patch) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const handleSign = async () => {
  if (!pdfId) return alert("Upload PDF first");

  try {
    const res = await fetch("https://signature-injector-4.onrender.com/sign-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfId, fields }),
    });

    const data = await res.json();
    console.log("SIGN RESPONSE:", data);

    if (!res.ok) {
      alert("Signing failed. Check backend logs.");
      return;
    }

    if (!data.signedPdfId) {
      alert("Backend did not return signedPdfId");
      return;
    }

    const fileUrl = `https://signature-injector-4.onrender.com/file/${data.signedPdfId}`;

    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = "signed.pdf";
    a.click();

  } catch (err) {
    console.error("sign error:", err);
    alert("Signing failed (network)");
  }
};

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  return (
    <div style={{ padding: 18, maxWidth: 1100, margin: "0 auto" }}>
      <h3 style={{ marginTop: 0 }}>Signature Injector — Frontend</h3>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <input type="file" accept="application/pdf" onChange={handleUpload} />
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => setTool("text")} style={{ marginRight: 6 }}>Text</button>
          <button onClick={() => setTool("signature")} style={{ marginRight: 6 }}>Signature</button>
          <button onClick={() => setTool("image")} style={{ marginRight: 6 }}>Image</button>
          <button onClick={() => setTool("date")} style={{ marginRight: 6 }}>Date</button>
          <button onClick={() => setTool("radio")} style={{ marginRight: 6 }}>Radio</button>
        </div>
      </div>

      {pagesMeta.length === 0 && (
        <div style={{ padding: 30, textAlign: "center", color: "#666" }}>Upload a PDF to begin</div>
      )}

      {pagesMeta.map((meta, idx) => (
        <div
          key={idx}
          style={{
            position: "relative",
            marginBottom: 20,
            width: meta.width,
            border: "1px solid #ddd",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            cursor: tool ? "crosshair" : "default",
          }}
          onClick={(e) => handlePageClick(e, idx)}
        >
          <canvas ref={(el) => (canvasRefs.current[idx] = el)} />

          {fields
            .filter((f) => f.pageIndex === idx)
            .map((f) => (
              <FieldOverlay
                key={f.id}
                field={f}
                pdfWidth={meta.width}
                pdfHeight={meta.height}
                onChange={(patch) => handleFieldChange(f.id, patch)}
              />
            ))}
        </div>
      ))}

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <button onClick={handleSign} style={{ padding: "8px 16px" }}>Sign & Download</button>
      </div>

      {showSignaturePad && (
        <SignaturePad
          onSave={handleSignatureSave}
          onClose={() => {
            setShowSignaturePad(false);
            setSignatureTargetId(null);
          }}
        />
      )}
    </div>
  );
}
