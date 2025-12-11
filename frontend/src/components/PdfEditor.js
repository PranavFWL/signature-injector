import React, { useState, useRef, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist/webpack";
import "./PdfEditor.css";

// Single-file drop-in: PdfEditor contains PdfViewer, FieldOverlay and SignaturePad
// Put this file at src/components/PdfEditor.js and import <PdfEditor/> from your app.

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function PdfEditor() {
  // --- Pdf viewer state ---
  const [pdfId, setPdfId] = useState("");
  const [pagesMeta, setPagesMeta] = useState([]); // [{width,height}]
  const canvasRefs = useRef([]);
  const pageRefs = useRef([]);
  const mainContentRef = useRef(null);

  const [tool, setTool] = useState(null); // text|signature|image|date|radio
  const [fields, setFields] = useState([]); // {id,type,pageIndex,leftPct,topPct,widthPct,heightPct,value}

  // signature modal
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureTargetId, setSignatureTargetId] = useState(null);

  // drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);

  // render pages from ArrayBuffer
  const renderAllPages = async (pdfBinary) => {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBinary });
    const pdf = await loadingTask.promise;
    const total = pdf.numPages;

    const meta = [];
    canvasRefs.current = new Array(total).fill(null);
    pageRefs.current = new Array(total).fill(null);

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
  const handleFileProcess = async (file) => {
    if (!file || file.type !== "application/pdf") {
      alert("Please select a valid PDF file.");
      return;
    }
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

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileProcess(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileProcess(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  // --- Get the currently visible page in the viewport ---
  const getVisiblePageIndex = () => {
    if (!mainContentRef.current || pageRefs.current.length === 0) return 0;

    const scrollTop = mainContentRef.current.scrollTop;
    const containerTop = mainContentRef.current.getBoundingClientRect().top;

    let closestPageIndex = 0;
    let minDistance = Infinity;

    pageRefs.current.forEach((pageEl, idx) => {
      if (pageEl) {
        const rect = pageEl.getBoundingClientRect();
        const pageCenter = rect.top + rect.height / 2;
        const containerCenter = containerTop + mainContentRef.current.clientHeight / 2;
        const distance = Math.abs(pageCenter - containerCenter);

        if (distance < minDistance) {
          minDistance = distance;
          closestPageIndex = idx;
        }
      }
    });

    return closestPageIndex;
  };

  // --- Handle tool button click - place field at center of visible page ---
  const handleToolClick = (toolType) => {
    if (!pagesMeta || pagesMeta.length === 0) {
      alert("Please upload a PDF first.");
      return;
    }

    const pageIndex = getVisiblePageIndex();
    const meta = pagesMeta[pageIndex];
    if (!meta) return;

    // Optimize size based on field type
    let widthPct, heightPct;
    switch (toolType) {
      case "text":
        widthPct = 0.20;
        heightPct = 0.04;
        break;
      case "date":
        widthPct = 0.15;
        heightPct = 0.04;
        break;
      case "radio":
        widthPct = 0.15;
        heightPct = 0.04;
        break;
      case "signature":
        widthPct = 0.25;
        heightPct = 0.08;
        break;
      case "image":
        widthPct = 0.20;
        heightPct = 0.15;
        break;
      default:
        widthPct = 0.20;
        heightPct = 0.05;
    }

    // Place at center of the page
    const leftPct = (1 - widthPct) / 2;
    const topPct = (1 - heightPct) / 2;

    const id = Math.random().toString(36).slice(2, 9);

    // For radio buttons, create with additional properties
    const newField = {
      id,
      type: toolType,
      pageIndex,
      leftPct,
      topPct,
      widthPct,
      heightPct,
      value: "",
      ...(toolType === "radio" && {
        label: "Option",
        groupId: id, // Each radio starts as its own group
        selected: false
      })
    };

    setFields((p) => [...p, newField]);

    if (toolType === "signature") {
      setSignatureTargetId(id);
      setShowSignaturePad(true);
    }

    setTool(null);
  };

  // --- place field on page click (kept for backward compatibility) ---
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

    // Optimize size based on field type
    let widthPct, heightPct;
    switch (tool) {
      case "text":
        widthPct = 0.20;
        heightPct = 0.04;
        break;
      case "date":
        widthPct = 0.15;
        heightPct = 0.04;
        break;
      case "radio":
        widthPct = 0.15;
        heightPct = 0.04;
        break;
      case "signature":
        widthPct = 0.25;
        heightPct = 0.08;
        break;
      case "image":
        widthPct = 0.20;
        heightPct = 0.15;
        break;
      default:
        widthPct = 0.20;
        heightPct = 0.05;
    }

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
      ...(tool === "radio" && {
        label: "Option",
        groupId: id,
        selected: false
      })
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
    setFields((prev) => {
      // Special handling for radio buttons
      if (patch.hasOwnProperty('selected')) {
        const currentField = prev.find((f) => f.id === id);

        if (currentField && currentField.type === 'radio' && patch.selected === true) {
          // When selecting a radio, unselect all others in the same group
          return prev.map((f) => {
            if (f.id === id) {
              return { ...f, ...patch };
            } else if (f.type === 'radio' && f.groupId === currentField.groupId && f.id !== id) {
              return { ...f, selected: false };
            }
            return f;
          });
        }
      }

      // Default behavior for all other fields
      return prev.map((f) => (f.id === id ? { ...f, ...patch } : f));
    });
  };

  const handleFieldDelete = (id) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
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
    <div className="pdf-editor-container">
      {/* Fixed Header */}
      <header className="pdf-editor-header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="app-title">PDF Editor</h1>
            {pagesMeta.length > 0 && (
              <div className="file-upload-compact">
                <label htmlFor="pdf-upload-header" className="upload-btn-small">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                  </svg>
                  Choose File
                </label>
                <input
                  id="pdf-upload-header"
                  type="file"
                  accept="application/pdf"
                  onChange={handleUpload}
                  style={{ display: "none" }}
                />
              </div>
            )}
          </div>

          <div className="header-center">
            {pagesMeta.length > 0 && (
              <>
                <button className="tool-btn" onClick={() => handleToolClick("text")} title="Add Text Field">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4 7 4 4 20 4 20 7"/>
                    <line x1="9" y1="20" x2="15" y2="20"/>
                    <line x1="12" y1="4" x2="12" y2="20"/>
                  </svg>
                  Text
                </button>
                <button className="tool-btn" onClick={() => handleToolClick("signature")} title="Add Signature">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 17l3-3 3 3 9-9 3 3-12 12H3v-6z"/>
                  </svg>
                  Signature
                </button>
                <button className="tool-btn" onClick={() => handleToolClick("image")} title="Add Image">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Image
                </button>
                <button className="tool-btn" onClick={() => handleToolClick("date")} title="Add Date Field">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  Date
                </button>
                <button className="tool-btn" onClick={() => handleToolClick("radio")} title="Add Radio Button">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="3" fill="currentColor"/>
                  </svg>
                  Radio
                </button>
              </>
            )}
          </div>

          <div className="header-right">
            {pagesMeta.length > 0 && (
              <button className="download-btn-header" onClick={handleSign}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download PDF
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="pdf-editor-main" ref={mainContentRef}>
        {pagesMeta.length === 0 ? (
          <div
            className={`upload-zone ${isDragOver ? "drag-over" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="upload-zone-content">
              <svg className="upload-icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <h2 className="upload-title">Upload your PDF</h2>
              <p className="upload-description">Drag and drop your PDF file here, or click to browse</p>
              <label htmlFor="pdf-upload-main" className="upload-btn-main">
                Choose File
              </label>
              <input
                id="pdf-upload-main"
                type="file"
                accept="application/pdf"
                onChange={handleUpload}
                style={{ display: "none" }}
              />
            </div>
          </div>
        ) : (
          <div className="pdf-pages-container">
            {pagesMeta.map((meta, idx) => (
              <div
                key={idx}
                ref={(el) => (pageRefs.current[idx] = el)}
                className="pdf-page-wrapper"
                style={{ width: meta.width }}
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
                      onDelete={() => handleFieldDelete(f.id)}
                      onRequestOpenSignature={(id) => {
                        setSignatureTargetId(id);
                        setShowSignaturePad(true);
                      }}
                    />
                  ))}
              </div>
            ))}
          </div>
        )}
      </main>


      {/* Signature Pad Modal */}
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
function FieldOverlay({ field, pdfWidth, pdfHeight, onChange, onDelete, onRequestOpenSignature }) {
  // convert pct <-> px via pdfWidth/pdfHeight
  const wrapperRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // local temp pos to avoid excessive re-renders while dragging
  const posRef = useRef({ leftPct: field.leftPct, topPct: field.topPct, widthPct: field.widthPct, heightPct: field.heightPct });

  useEffect(() => {
    posRef.current = { leftPct: field.leftPct, topPct: field.topPct, widthPct: field.widthPct, heightPct: field.heightPct };
  }, [field.leftPct, field.topPct, field.widthPct, field.heightPct]);

  const leftPx = posRef.current.leftPct * pdfWidth;
  const topPx = posRef.current.topPct * pdfHeight;
  const widthPx = posRef.current.widthPct * pdfWidth;
  const heightPx = posRef.current.heightPct * pdfHeight;

  // Track if we just dragged to prevent click events
  const justDraggedRef = useRef(false);

  // DRAG
  const onMouseDownDrag = (e) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = posRef.current.leftPct * pdfWidth;
    const startTop = posRef.current.topPct * pdfHeight;

    let hasMoved = false;
    const dragThreshold = 3; // pixels - minimum movement to start dragging

    const onMove = (mv) => {
      const dx = mv.clientX - startX;
      const dy = mv.clientY - startY;

      // Only start dragging if moved beyond threshold
      if (!hasMoved && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
        hasMoved = true;
        setDragging(true);
      }

      if (hasMoved) {
        justDraggedRef.current = true;
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
      }
    };

    const onUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);

      // Reset the drag flag after a short delay to prevent click events
      if (hasMoved) {
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 100);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // RESIZE (bottom-right corner)
  const onMouseDownResize = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing(true);
    setIsHovered(false); // Hide border while resizing
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

  // Show border and background only when hovered and not dragging
  const showBorder = isHovered && !dragging;

  const styleOuter = {
    position: "absolute",
    left: leftPx + "px",
    top: topPx + "px",
    width: widthPx + "px",
    height: heightPx + "px",
    border: showBorder ? "2px dashed #667eea" : "2px dashed transparent",
    background: showBorder ? "rgba(255,255,255,0.95)" : "transparent",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: dragging ? "grabbing" : "grab",
    zIndex: 20,
    padding: 4,
    borderRadius: "6px",
    boxShadow: showBorder ? "0 4px 15px rgba(102, 126, 234, 0.2)" : "none",
    transition: "all 0.2s ease",
  };

  // Handle mousedown on the field wrapper - start dragging unless clicking on interactive elements
  const handleWrapperMouseDown = (e) => {
    // Don't start dragging if clicking on input, button, or label
    const target = e.target;
    const isInteractive = target.tagName === 'INPUT' ||
                         target.tagName === 'BUTTON' ||
                         target.tagName === 'LABEL' ||
                         target.closest('label');

    if (!isInteractive) {
      onMouseDownDrag(e);
    } else {
      e.stopPropagation();
    }
  };

  return (
    <div
      ref={wrapperRef}
      style={styleOuter}
      onMouseDown={handleWrapperMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Delete button - only show when hovered and not dragging */}
      {showBorder && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: -10,
            right: -10,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #fc8181 0%, #f56565 100%)",
            color: "white",
            border: "2px solid white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "bold",
            zIndex: 50,
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(245, 101, 101, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.2)";
          }}
          title="Delete field"
        >
          ×
        </button>
      )}

      {/* content */}
      <div style={{ position: "relative", zIndex: 25, width: "100%", padding: 4, pointerEvents: "auto" }}>
        {field.type === "text" && (
          <input
            value={field.value || ""}
            onChange={(e) => onValueChange(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="TEXT"
            style={{ width: "100%", border: "none", outline: "none", background: "transparent" }}
          />
        )}

        {field.type === "date" && (
          <input
            type="date"
            value={field.value || ""}
            onChange={(e) => onValueChange(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ width: "100%", border: "none", outline: "none", background: "transparent" }}
          />
        )}

        {field.type === "radio" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "4px 8px"
            }}
          >
            {/* Radio circle */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                // Toggle selection for this radio and unselect others in group
                const newSelected = !field.selected;
                onChange({ selected: newSelected });
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "2px solid #667eea",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
                background: "white"
              }}
            >
              {field.selected && (
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: "#667eea"
                  }}
                />
              )}
            </div>

            {/* Editable label */}
            <input
              type="text"
              value={field.label || ""}
              onChange={(e) => onChange({ label: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: "0.9rem",
                color: "#2d3748"
              }}
              placeholder="Option"
            />
          </div>
        )}

        {field.type === "image" && (
          <ImageUploader value={field.value} onChange={(b64) => onChange({ value: b64 })} />
        )}

        {field.type === "signature" && (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "move"
            }}
          >
            {field.value ? (
              <img
                src={`data:image/png;base64,${field.value}`}
                alt="sig"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!justDraggedRef.current) {
                    onRequestOpenSignature(field.id);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                title="Drag to move, double-click to change signature"
              />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!justDraggedRef.current) {
                    onRequestOpenSignature(field.id);
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  padding: "8px 16px",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(102, 126, 234, 0.3)",
                }}
              >
                Sign Here
              </button>
            )}
          </div>
        )}
      </div>

      {/* resize handle - only show when hovered and not dragging */}
      {showBorder && (
        <div
          onMouseDown={onMouseDownResize}
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 18,
            height: 18,
            cursor: "nwse-resize",
            zIndex: 40,
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            borderRadius: "50%",
            border: "2px solid white",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
          }}
          title="Drag corner to resize"
        />
      )}
    </div>
  );
}

// ---------------- ImageUploader ----------------
function ImageUploader({ value, onChange }) {
  // Generate a stable ID for this component instance
  const inputId = useRef(`img-upload-${Math.random().toString(36).slice(2, 9)}`).current;

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ab = await f.arrayBuffer();
    const b64 = bufferToBase64(ab);
    onChange(b64);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", justifyContent: "center", width: "100%" }}>
      {value ? (
        <img src={`data:image/png;base64,${value}`} alt="img" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: "4px" }} />
      ) : (
        <span style={{ fontSize: "0.85rem", color: "#718096" }}>No image</span>
      )}
      <label
        htmlFor={inputId}
        style={{
          padding: "6px 12px",
          background: "#667eea",
          color: "white",
          borderRadius: "6px",
          fontSize: "0.75rem",
          cursor: "pointer",
          fontWeight: "600",
        }}
      >
        Choose Image
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        onChange={onPick}
        style={{ display: "none" }}
      />
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

  // Helper to get scaled coordinates
  const getScaledCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    // Calculate scale factors between canvas internal size and displayed size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Get mouse position relative to canvas and scale it
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    return { x, y };
  };

  const onDown = (e) => {
    drawing.current = true;
    const ctx = getCtx();
    const { x, y } = getScaledCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onMove = (e) => {
    if (!drawing.current) return;
    const ctx = getCtx();
    const { x, y } = getScaledCoords(e);
    ctx.lineTo(x, y);
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
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0, 0, 0, 0.6)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2000,
      padding: "1rem",
    }}>
      <div style={{
        background: "#fff",
        padding: "2rem",
        borderRadius: "16px",
        width: "100%",
        maxWidth: "680px",
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
      }}>
        <div style={{
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <h2 style={{
            margin: 0,
            fontSize: "1.5rem",
            fontWeight: "700",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            Draw Your Signature
          </h2>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={clear}
              style={{
                padding: "0.6rem 1.2rem",
                background: "#f7fafc",
                color: "#4a5568",
                border: "2px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "0.9rem",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
            >
              Clear
            </button>
            <button
              onClick={save}
              style={{
                padding: "0.6rem 1.5rem",
                background: "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "0.9rem",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s ease",
                boxShadow: "0 4px 15px rgba(72, 187, 120, 0.3)",
              }}
            >
              Save
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "0.6rem 1.2rem",
                background: "#f7fafc",
                color: "#4a5568",
                border: "2px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "0.9rem",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
            >
              Close
            </button>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: 200,
            border: "2px solid #e2e8f0",
            borderRadius: "12px",
            touchAction: "none",
            cursor: "crosshair",
            boxShadow: "inset 0 2px 8px rgba(0, 0, 0, 0.05)",
          }}
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
        <p style={{
          marginTop: "1rem",
          marginBottom: 0,
          fontSize: "0.875rem",
          color: "#718096",
          textAlign: "center",
        }}>
          Draw your signature with your mouse or touchscreen
        </p>
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
