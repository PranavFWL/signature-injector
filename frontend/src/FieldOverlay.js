import React from "react";
import { Rnd } from "react-rnd";

const FieldOverlay = ({ onChangePosition, pdfWidth, pdfHeight }) => {
  return (
    <Rnd
      default={{
        x: 50,
        y: 50,
        width: 150,
        height: 60,
      }}
      bounds="parent"
      onDragStop={(e, d) => {
        const leftPct = d.x / pdfWidth;
        const topPct = d.y / pdfHeight;

        console.log("Dragged:", { leftPct, topPct });

        onChangePosition({ leftPct, topPct });
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        const widthPx = ref.offsetWidth;
        const heightPx = ref.offsetHeight;

        const widthPct = widthPx / pdfWidth;
        const heightPct = heightPx / pdfHeight;

        const leftPct = position.x / pdfWidth;
        const topPct = position.y / pdfHeight;

        console.log("Resized:", { leftPct, topPct, widthPct, heightPct });

        onChangePosition({
          leftPct,
          topPct,
          widthPct,
          heightPct,
        });
      }}
      style={{
        border: "2px solid #007bff",
        backgroundColor: "rgba(0, 123, 255, 0.1)",
        borderRadius: "4px",
        cursor: "move",
      }}
    >
      <div style={{ padding: "5px", fontSize: "14px" }}>Signature Box</div>
    </Rnd>
  );
};

export default FieldOverlay;
