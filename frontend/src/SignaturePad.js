import React, { useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

export default function SignaturePad({ onSave, onClose }) {
  const sigRef = useRef(null);

  const handleSave = () => {
    const canvas = sigRef.current?.getCanvas();
    if (!canvas) {
      alert("No signature drawn");
      return;
    }
    const dataURL = canvas.toDataURL("image/png");
    onSave(dataURL);
  };

  const handleClear = () => {
    sigRef.current?.clear();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000
    }}>
      <div style={{ background: "#fff", padding: 18, borderRadius: 8, width: 420 }}>
        <h4 style={{ margin: "0 0 10px 0" }}>Draw signature</h4>
        <SignatureCanvas ref={sigRef} penColor="black" canvasProps={{ width: 380, height: 180, className: "sigCanvas" }} />
        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={handleClear}>Clear</button>
          <button onClick={handleSave}>Save</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
