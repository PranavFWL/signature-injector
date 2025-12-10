import React, { useState, useRef, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist/webpack";

// Single-file drop-in: PdfEditor contains PdfViewer, FieldOverlay and SignaturePad
// Put this file at src/components/PdfEditor.js and import <PdfEditor/> from your app.

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function PdfEditor() {
  // --- Pdf viewer state ---
  const [pdfId, setPdfId] = useState("");
  const [pagesMeta, setPagesMeta] = useState([]); // [{width,height}]
  const canvasRefs = useRef([]);

  const [tool, setTool] = useState(null); // text|signature|image|date|radio
  const [fields, setFields] = useState([]); // {id,type,pageIndex,leftPct,topPct,widthPct,heightPct,value}

  // signature modal
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureTargetId, setSignatureTargetId] = useState(null);

  // render pages from ArrayBuffer
  const renderAllPages = async (pdfBinary) => {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBinary });
    const pdf = await loadingTask.promise;
    const total = pdf.numPages;

    const meta = [];
    canvasRefs.current = new Array(total).fill(null);

    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1.5 });
      meta.push({ width: vp.width, height: vp.height });
    }

    setPagesMeta(meta);

    // allow React to mount canvases
    setTimeout(async () => {
      for (let i = 1; i <= total; i++) {
        await renderPage(pdf, i);
      }
    }, 40);
  };

  const renderPage = async (pdf, pageNum) => {
    const canvas = canvasRefs.current[pageNum - 1];
    if (!canvas) return;
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
  };

  // --- upload handler ---
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const arrayBuffer = await file.arrayBuffer();
    renderAllPages(arrayBuffer);

    // upload to backend
    try {
      const fd = new FormData();
      fd.append("file", new Blob([arrayBuffer], { type: "application/pdf" }), file.name);
      const res = await fetch("http://localhost:5000/upload-pdf", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        alert("Upload failed. Check backend logs.");
        return;
      }
      setPdfId(data.pdfId);
    } catch (err) {
      console.error(err);
      alert("Upload failed (network). See console.");
    }
  };

  // --- place field on page click ---
  const handlePageClick = (e, pageIndex) => {
    if (!tool) return;
    const meta = pagesMeta[pageIndex];
    if (!meta) return;

    // wrapper rect (the div that contains canvas)
    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    // convert to page space (we used vp.width/height as CSS)
    const leftPct = xPx / meta.width;
    const topPct = yPx / meta.height;
    const widthPct = 0.25;
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

    setFields((p) => [...p, newField]);

    if (tool === "signature") {
      setSignatureTargetId(id);
      setShowSignaturePad(true);
    }

    setTool(null);
  };

  const handleSignatureSave = (dataURL) => {
    if (!signatureTargetId) return setShowSignaturePad(false);
    const base64 = dataURL.split(",")[1];
    setFields((prev) => prev.map((f) => (f.id === signatureTargetId ? { ...f, value: base64 } : f)));
    setShowSignaturePad(false);
    setSignatureTargetId(null);
  };

  const handleFieldChange = (id, patch) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  // --- sign and download ---
  const handleSign = async () => {
    if (!pdfId) return alert("Upload PDF to server first.");
    try {
      const res = await fetch("http://localhost:5000/sign-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfId, fields }),
      });
      const data = await res.json();
      if (!res.ok) return alert("Signing failed. Check backend logs.");

      const a = document.createElement("a");
      a.href = "data:application/pdf;base64," + data.pdf;
      a.download = "signed.pdf";
      a.click();
    } catch (err) {
      console.error(err);
      alert("Signing failed (network). See console.");
    }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  return (
    <div style={{ padding: 18, maxWidth: 1100, margin: "0 auto" }}>
      <h3 style={{ marginTop: 0 }}>Signature Injector — Minimal Functional</h3>

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
          style={{ position: "relative", marginBottom: 20, width: meta.width, border: "1px solid #ddd" }}
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
                onRequestOpenSignature={(id) => {
                  setSignatureTargetId(id);
                  setShowSignaturePad(true);
                }}
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

// ---------------- FieldOverlay ----------------
function FieldOverlay({ field, pdfWidth, pdfHeight, onChange, onRequestOpenSignature }) {
  // convert pct <-> px via pdfWidth/pdfHeight
  const wrapperRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  // local temp pos to avoid excessive re-renders while dragging
  const posRef = useRef({ leftPct: field.leftPct, topPct: field.topPct, widthPct: field.widthPct, heightPct: field.heightPct });

  useEffect(() => {
    posRef.current = { leftPct: field.leftPct, topPct: field.topPct, widthPct: field.widthPct, heightPct: field.heightPct };
  }, [field.leftPct, field.topPct, field.widthPct, field.heightPct]);

  const leftPx = posRef.current.leftPct * pdfWidth;
  const topPx = posRef.current.topPct * pdfHeight;
  const widthPx = posRef.current.widthPct * pdfWidth;
  const heightPx = posRef.current.heightPct * pdfHeight;

  // DRAG
  const onMouseDownDrag = (e) => {
    e.stopPropagation();
    setDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = posRef.current.leftPct * pdfWidth;
    const startTop = posRef.current.topPct * pdfHeight;

    const onMove = (mv) => {
      const dx = mv.clientX - startX;
      const dy = mv.clientY - startY;
      let newLeftPx = startLeft + dx;
      let newTopPx = startTop + dy;
      // clamp
      newLeftPx = Math.max(0, Math.min(newLeftPx, pdfWidth - widthPx));
      newTopPx = Math.max(0, Math.min(newTopPx, pdfHeight - heightPx));
      const newLeftPct = newLeftPx / pdfWidth;
      const newTopPct = newTopPx / pdfHeight;
      posRef.current.leftPct = newLeftPct;
      posRef.current.topPct = newTopPct;
      // visual update by forcing a small state change via onChange (throttle could be added)
      onChange({ leftPct: newLeftPct, topPct: newTopPct });
    };

    const onUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // RESIZE (bottom-right corner)
  const onMouseDownResize = (e) => {
    e.stopPropagation();
    setResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = posRef.current.widthPct * pdfWidth;
    const startHeight = posRef.current.heightPct * pdfHeight;

    const onMove = (mv) => {
      const dx = mv.clientX - startX;
      const dy = mv.clientY - startY;
      let newWpx = Math.max(20, startWidth + dx);
      let newHpx = Math.max(12, startHeight + dy);
      // clamp right/bottom
      newWpx = Math.min(newWpx, pdfWidth - posRef.current.leftPct * pdfWidth);
      newHpx = Math.min(newHpx, pdfHeight - posRef.current.topPct * pdfHeight);
      const newWPct = newWpx / pdfWidth;
      const newHPct = newHpx / pdfHeight;
      posRef.current.widthPct = newWPct;
      posRef.current.heightPct = newHPct;
      onChange({ widthPct: newWPct, heightPct: newHPct });
    };

    const onUp = () => {
      setResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // input handlers for text/date
  const onValueChange = (v) => onChange({ value: v });

  const styleOuter = {
    position: "absolute",
    left: leftPx + "px",
    top: topPx + "px",
    width: widthPx + "px",
    height: heightPx + "px",
    border: "2px dashed #1976d2",
    background: "rgba(255,255,255,0.85)",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: dragging ? "grabbing" : "grab",
    zIndex: 20,
    padding: 4,
  };

  return (
    <div ref={wrapperRef} style={styleOuter} onMouseDown={(e) => e.stopPropagation()}>
      {/* Drag handle area (full box) */}
      <div
        onMouseDown={onMouseDownDrag}
        style={{ position: "absolute", inset: 0, cursor: "move" }}
        title="Drag to move"
      />

      {/* content */}
      <div style={{ zIndex: 25, width: "100%", padding: 4 }}>
        {field.type === "text" && (
          <input
            value={field.value || ""}
            onChange={(e) => onValueChange(e.target.value)}
            style={{ width: "100%", border: "none", outline: "none", background: "transparent" }}
          />
        )}

        {field.type === "date" && (
          <input
            type="date"
            value={field.value || ""}
            onChange={(e) => onValueChange(e.target.value)}
            style={{ width: "100%", border: "none", outline: "none", background: "transparent" }}
          />
        )}

        {field.type === "radio" && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <label>
              <input
                type="radio"
                checked={field.value === "yes"}
                onChange={() => onChange({ value: field.value === "yes" ? "" : "yes" })}
              />
              Yes
            </label>
            <label>
              <input
                type="radio"
                checked={field.value === "no"}
                onChange={() => onChange({ value: field.value === "no" ? "" : "no" })}
              />
              No
            </label>
          </div>
        )}

        {field.type === "image" && (
          <ImageUploader value={field.value} onChange={(b64) => onChange({ value: b64 })} />
        )}

        {field.type === "signature" && (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {field.value ? (
              <img src={`data:image/png;base64,${field.value}`} alt="sig" style={{ maxWidth: "100%", maxHeight: "100%" }} />
            ) : (
              <button onClick={() => onRequestOpenSignature(field.id)}>Open Pad</button>
            )}
          </div>
        )}
      </div>

      {/* resize handle */}
      <div
        onMouseDown={onMouseDownResize}
        style={{ position: "absolute", right: 2, bottom: 2, width: 14, height: 14, cursor: "nwse-resize", zIndex: 40, background: "#1976d2" }}
        title="Drag corner to resize"
      />
    </div>
  );
}

// ---------------- ImageUploader ----------------
function ImageUploader({ value, onChange }) {
  const onPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ab = await f.arrayBuffer();
    const b64 = bufferToBase64(ab);
    onChange(b64);
  };
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
      {value ? <img src={`data:image/png;base64,${value}`} alt="img" style={{ maxWidth: "100%", maxHeight: "100%" }} /> : <span>No image</span>}
      <input type="file" accept="image/*" onChange={onPick} />
    </div>
  );
}

// ---------------- SignaturePad ----------------
function SignaturePad({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = 600;
    c.height = 200;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, []);

  const getCtx = () => canvasRef.current?.getContext("2d");

  const onDown = (e) => {
    drawing.current = true;
    const ctx = getCtx();
    const r = canvasRef.current.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
  };
  const onMove = (e) => {
    if (!drawing.current) return;
    const ctx = getCtx();
    const r = canvasRef.current.getBoundingClientRect();
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
    ctx.stroke();
  };
  const onUp = () => {
    drawing.current = false;
  };

  const clear = () => {
    const ctx = getCtx();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const save = () => {
    const dataURL = canvasRef.current.toDataURL("image/png");
    onSave(dataURL);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
      <div style={{ background: "#fff", padding: 12, borderRadius: 8, width: 640 }}>
        <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
          <strong>Signature Pad</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={clear}>Clear</button>
            <button onClick={save}>Save</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: 200, border: "1px solid #ccc", touchAction: "none" }}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          onTouchStart={(ev) => {
            const t = ev.touches[0];
            onDown({ clientX: t.clientX, clientY: t.clientY });
          }}
          onTouchMove={(ev) => {
            const t = ev.touches[0];
            onMove({ clientX: t.clientX, clientY: t.clientY });
            ev.preventDefault();
          }}
          onTouchEnd={onUp}
        />
      </div>
    </div>
  );
}

// small helper to convert ArrayBuffer to base64
function bufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
