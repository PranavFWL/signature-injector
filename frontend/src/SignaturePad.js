import React, { useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

const SignaturePad = ({ onSave, onClose }) => {
  const sigRef = useRef();

  const handleSave = () => {
    const dataURL = sigRef.current.getCanvas().toDataURL("image/png");

    onSave(dataURL);
  };

  const handleClear = () => {
    sigRef.current.clear();
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 1000,
    }}>
      <div style={{
        background: "#fff",
        padding: "20px",
        borderRadius: "10px",
        width: "400px",
        textAlign: "center"
      }}>
        <h3>Draw Your Signature</h3>

        <SignatureCanvas
          ref={sigRef}
          penColor="black"
          canvasProps={{ width: 350, height: 200, className: "sigCanvas" }}
        />

        <div style={{ marginTop: 10 }}>
          <button onClick={handleClear}>Clear</button>
          <button onClick={handleSave} style={{ marginLeft: 10 }}>Save</button>
          <button onClick={onClose} style={{ marginLeft: 10 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default SignaturePad;
