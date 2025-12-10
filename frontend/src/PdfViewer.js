// frontend/src/PdfViewer.js
import React, { useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/webpack";
import FieldOverlay from "./FieldOverlay";
import SignaturePad from "./SignaturePad";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function PdfViewer() {
  const [pdfId, setPdfId] = useState("");
  const [originalFileName, setOriginalFileName] = useState("document");
  const [signatureBase64, setSignatureBase64] = useState("");
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  const [numPages, setNumPages] = useState(0);
  const [pagesMeta, setPagesMeta] = useState([]); // [{width,height}, ...]
  const canvasRefs = useRef([]); // canvasRefs.current[idx] -> <canvas>

  // canonical single signature placement (percentage coords relative to page)
  const [fieldData, setFieldData] = useState({
    pageIndex: 0, // 0-based
    leftPct: 0,
    topPct: 0,
    widthPct: 0,
    heightPct: 0,
  });

  // -------------------------
  // Render helpers
  // -------------------------
  const renderSinglePage = async (pdf, pageNum) => {
    // pageNum: 1-based
    const canvas = canvasRefs.current[pageNum - 1];
    if (!canvas) return;

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    await page.render({ canvasContext: ctx, viewport }).promise;
  };

  const renderAllPages = async (pdfBinary) => {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBinary });
    const pdf = await loadingTask.promise;

    const total = pdf.numPages;
    setNumPages(total);
    canvasRefs.current = new Array(total).fill(null);

    // collect meta
    const meta = [];
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1.5 });
      meta.push({ width: vp.width, height: vp.height });
    }

    setPagesMeta(meta);

    // give react one tick to mount canvases, then render pages
    setTimeout(async () => {
      for (let i = 1; i <= total; i++) {
        await renderSinglePage(pdf, i);
      }
    }, 60);
  };

  // -------------------------
  // Upload PDF: render locally and upload to backend for a pdfId
  // -------------------------
  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOriginalFileName(file.name.replace(/\.pdf$/i, ""));
    setSignatureBase64(""); // clear previous signature

    const arrayBuffer = await file.arrayBuffer();

    // upload the file (backend should return pdfId)
    try {
      const fd = new FormData();
      fd.append("file", new Blob([arrayBuffer], { type: "application/pdf" }), file.name);

      const resp = await fetch("http://localhost:5000/upload-pdf", {
        method: "POST",
        body: fd,
      });

      const data = await resp.json();
      if (!resp.ok) {
        console.error("upload failed", data);
        alert("Upload failed");
        return;
      }

      setPdfId(data.pdfId || "");
    } catch (err) {
      console.error("upload error", err);
      alert("Upload failed");
      return;
    }

    // render pages locally for preview
    await renderAllPages(arrayBuffer);
  };

  // -------------------------
  // Signature saved: set default bottom-center for page 0
  // -------------------------
  const saveSignature = (dataURL) => {
    const cleaned = dataURL.split(",")[1];
    setSignatureBase64(cleaned);

    // default placement at bottom center of page 0 if meta exists
    if (pagesMeta && pagesMeta.length > 0) {
      const m = pagesMeta[0];
      const defaultW = Math.min(200, m.width * 0.4);
      const defaultH = defaultW * 0.4;

      setFieldData({
        pageIndex: 0,
        leftPct: (m.width / 2 - defaultW / 2) / m.width,
        topPct: (m.height - defaultH - 40) / m.height,
        widthPct: defaultW / m.width,
        heightPct: defaultH / m.height,
      });
    }

    setShowSignaturePad(false);
  };

  // -------------------------
  // When user picks a different page from dropdown
  // preserve pixel size: convert old px → new pct
  // -------------------------
  const handlePageChange = (newIndex) => {
    const oldIndex = fieldData.pageIndex;
    if (!pagesMeta[oldIndex] || !pagesMeta[newIndex]) {
      setFieldData((prev) => ({ ...prev, pageIndex: newIndex }));
      return;
    }

    const from = pagesMeta[oldIndex];
    const to = pagesMeta[newIndex];

    const pxLeft = fieldData.leftPct * from.width;
    const pxTop = fieldData.topPct * from.height;
    const pxW = fieldData.widthPct * from.width;
    const pxH = fieldData.heightPct * from.height;

    // clamp positions so box stays inside new page
    const newLeftPct = Math.min(Math.max(pxLeft / to.width, 0), 1 - pxW / to.width);
    const newTopPct = Math.min(Math.max(pxTop / to.height, 0), 1 - pxH / to.height);
    const newW = Math.min(pxW / to.width, 1);
    const newH = Math.min(pxH / to.height, 1);

    setFieldData({
      pageIndex: newIndex,
      leftPct: newLeftPct,
      topPct: newTopPct,
      widthPct: newW,
      heightPct: newH,
    });
  };

  // -------------------------
  // Called by FieldOverlay when user drags/resizes
  // field overlay will pass leftPct, topPct, widthPct, heightPct and pageIndex
  // -------------------------
  const handleFieldPositionChange = (upd) => {
    setFieldData((prev) => ({ ...prev, ...upd }));
  };

  // -------------------------
  // Send sign request
  // -------------------------
  const handleSign = async () => {
    if (!pdfId) return alert("Please upload PDF first.");
    if (!signatureBase64) return alert("Please draw your signature first.");

    const payload = {
      pdfId,
      signatureBase64,
      coords: {
        pageIndex: fieldData.pageIndex,
        leftPct: fieldData.leftPct,
        topPct: fieldData.topPct,
        widthPct: fieldData.widthPct,
        heightPct: fieldData.heightPct,
      },
    };

    const resp = await fetch("http://localhost:5000/sign-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("sign failed", data);
      alert("Signing failed");
      return;
    }

    // download signed pdf (backend returns base64)
    const a = document.createElement("a");
    a.href = "data:application/pdf;base64," + data.pdf;
    a.download = `${originalFileName}_Signed.pdf`;
    a.click();
  };

  // -------------------------
  // Render
  // -------------------------
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <input type="file" accept="application/pdf" onChange={handlePdfUpload} />

        {/* page selector appears only after PDF loaded and signature exists */}
        {pagesMeta.length > 0 && signatureBase64 && (
          <>
            <label style={{ marginLeft: "auto" }}>Signature page:</label>
            <select
              value={fieldData.pageIndex}
              onChange={(e) => handlePageChange(Number(e.target.value))}
            >
              {pagesMeta.map((_, idx) => (
                <option key={idx} value={idx}>
                  Page {idx + 1}
                </option>
              ))}
            </select>
          </>
        )}

        {pagesMeta.length > 0 && (
          <div style={{ marginLeft: "12px" }}>
            <button onClick={() => setShowSignaturePad(true)}>Draw Signature</button>
            <button onClick={handleSign} disabled={!signatureBase64} style={{ marginLeft: 8 }}>
              Download PDF
            </button>
          </div>
        )}
      </div>

      {/* Pages */}
      <div>
        {pagesMeta.map((meta, idx) => (
          <div
            key={idx}
            style={{
              position: "relative",
              marginBottom: 20,
              width: meta.width,
              border: "1px solid #ddd",
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            }}
          >
            <canvas ref={(el) => (canvasRefs.current[idx] = el)} />

            {/* Only show the single signature overlay when signature exists and page matches */}
            {signatureBase64 && fieldData.pageIndex === idx && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: meta.width,
                  height: meta.height,
                  pointerEvents: "none",
                }}
              >
                <div style={{ pointerEvents: "auto", width: "100%", height: "100%" }}>
                  <FieldOverlay
                    pageIndex={idx}
                    pdfWidth={meta.width}
                    pdfHeight={meta.height}
                    signatureBase64={signatureBase64}
                    onChangePosition={(d) => handleFieldPositionChange({ pageIndex: idx, ...d })}
                    initialField={fieldData}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showSignaturePad && (
        <SignaturePad onSave={saveSignature} onClose={() => setShowSignaturePad(false)} />
      )}
    </div>
  );
}
