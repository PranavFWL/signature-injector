import React, { useEffect } from "react";
import { Rnd } from "react-rnd";

const FieldOverlay = ({ onChangePosition, pdfWidth, pdfHeight, signatureBase64 }) => {
  const signatureURL = "data:image/png;base64," + signatureBase64;

  const defaultWidth = 200;
  const defaultHeight = 80;

  const defaultX = pdfWidth / 2 - defaultWidth / 2;   // Center
  const defaultY = pdfHeight - defaultHeight - 40;    // Bottom with margin

  // ⭐ INITIALIZE DEFAULT COORDS (only once)
  useEffect(() => {
    onChangePosition({
      leftPct: defaultX / pdfWidth,
      topPct: defaultY / pdfHeight,
      widthPct: defaultWidth / pdfWidth,
      heightPct: defaultHeight / pdfHeight,
    });
  }, []);

  return (
    <Rnd
      default={{
        x: defaultX,
        y: defaultY,
        width: defaultWidth,
        height: defaultHeight,
      }}
      bounds="parent"
      lockAspectRatio={true}
      onDragStop={(e, d) => {
        onChangePosition({
          leftPct: d.x / pdfWidth,
          topPct: d.y / pdfHeight,
        });
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        onChangePosition({
          leftPct: position.x / pdfWidth,
          topPct: position.y / pdfHeight,
          widthPct: ref.offsetWidth / pdfWidth,
          heightPct: ref.offsetHeight / pdfHeight,
        });
      }}
      style={{
        border: "2px solid #007bff",
        backgroundColor: "rgba(255,255,255,0.9)",
        borderRadius: "4px",
        cursor: "move",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={signatureURL}
        alt="signature"
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </Rnd>
  );
};

export default FieldOverlay;
