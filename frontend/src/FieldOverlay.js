// frontend/src/FieldOverlay.js
import React, { useState, useEffect } from "react";

export default function FieldOverlay({
  field,
  pdfWidth,
  pdfHeight,
  onChange,
}) {
  const { id, type, leftPct, topPct, widthPct, heightPct, value, label } = field;

  const x = leftPct * pdfWidth;
  const y = topPct * pdfHeight;
  const w = widthPct * pdfWidth;
  const h = heightPct * pdfHeight;

  const [drag, setDrag] = useState(null);
  const [editing, setEditing] = useState(false);

  // ----------------------
  // DRAGGING
  // ----------------------
  const startDrag = (e) => {
    if (e.target.dataset?.edit === "true") return; // don’t drag while editing
    e.stopPropagation();
    setDrag({
      offsetX: e.clientX - x,
      offsetY: e.clientY - y,
    });
  };

  const doDrag = (e) => {
    if (!drag || drag.resizing) return;

    let newLeft = (e.clientX - drag.offsetX) / pdfWidth;
    let newTop = (e.clientY - drag.offsetY) / pdfHeight;

    newLeft = Math.max(0, Math.min(1 - widthPct, newLeft));
    newTop = Math.max(0, Math.min(1 - heightPct, newTop));

    onChange({ leftPct: newLeft, topPct: newTop });
  };

  const endDrag = () => setDrag(null);

  // ----------------------
  // RESIZING
  // ----------------------
  const startResize = (e) => {
    e.stopPropagation();
    setDrag({
      resizing: true,
      startX: e.clientX,
      startY: e.clientY,
      startW: w,
      startH: h,
    });
  };

  const doResize = (e) => {
    if (!drag?.resizing) return;

    const deltaX = e.clientX - drag.startX;
    const deltaY = e.clientY - drag.startY;

    const newW = (drag.startW + deltaX) / pdfWidth;
    const newH = (drag.startH + deltaY) / pdfHeight;

    onChange({
      widthPct: Math.max(0.04, Math.min(1, newW)),
      heightPct: Math.max(0.04, Math.min(1, newH)),
    });
  };

  const endResize = () => setDrag(null);

  // ----------------------
  // GLOBAL EVENT HANDLERS
  // ----------------------
  useEffect(() => {
    window.addEventListener("mousemove", drag?.resizing ? doResize : doDrag);
    window.addEventListener("mouseup", drag?.resizing ? endResize : endDrag);

    return () => {
      window.removeEventListener("mousemove", drag?.resizing ? doResize : doDrag);
      window.removeEventListener("mouseup", drag?.resizing ? endResize : endDrag);
    };
  });

  // ----------------------
  // IMAGE UPLOAD HANDLER
  // ----------------------
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      onChange({ value: base64 });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        border: "2px solid #007bff",
        background: "rgba(0, 123, 255, 0.05)",
        borderRadius: 4,
        cursor: "move",
        userSelect: "none",
        boxSizing: "border-box",
      }}
      onMouseDown={startDrag}
    >
      {/* ---------- FIELD CONTENT ---------- */}
      <div style={{ padding: 4, height: "100%", width: "100%" }}>
        
        {/* TEXT FIELD */}
        {type === "text" && (
          <input
            data-edit="true"
            type="text"
            value={value}
            placeholder="Enter text"
            onChange={(e) => onChange({ value: e.target.value })}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
            }}
          />
        )}

        {/* DATE FIELD */}
        {type === "date" && (
          <input
            data-edit="true"
            type="date"
            value={value}
            onChange={(e) => onChange({ value: e.target.value })}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              outline: "none",
            }}
          />
        )}

        {/* RADIO FIELD */}
        {type === "radio" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: "100%",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: "2px solid black",
                marginRight: 6,
              }}
            />
            <input
              data-edit="true"
              type="text"
              placeholder="Option"
              value={label || ""}
              onChange={(e) => onChange({ label: e.target.value })}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
              }}
            />
          </div>
        )}

        {/* IMAGE FIELD */}
        {type === "image" && (
          <div style={{ width: "100%", height: "100%" }}>
            {value ? (
              <img
                src={`data:image/png;base64,${value}`}
                alt="Uploaded"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <label
                data-edit="true"
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                Upload Image
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleImageUpload}
                />
              </label>
            )}
          </div>
        )}

        {/* SIGNATURE FIELD */}
        {type === "signature" && value && (
          <img
            src={`data:image/png;base64,${value}`}
            alt="signature"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        )}
      </div>

      {/* ---------- RESIZE HANDLE ---------- */}
      <div
        onMouseDown={startResize}
        style={{
          position: "absolute",
          right: -6,
          bottom: -6,
          width: 12,
          height: 12,
          background: "white",
          border: "2px solid #007bff",
          borderRadius: 4,
          cursor: "nwse-resize",
        }}
      ></div>
    </div>
  );
}
