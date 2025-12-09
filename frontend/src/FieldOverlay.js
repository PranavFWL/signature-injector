import React from "react";
import { Rnd } from "react-rnd";

const FieldOverlay = ({ canvasWidth, canvasHeight }) => {
  return (
    <Rnd
      default={{
        x: 50,
        y: 50,
        width: 150,
        height: 60,
      }}
      bounds="parent"
      style={{
        border: "2px solid #007bff",
        backgroundColor: "rgba(0, 123, 255, 0.1)",
        borderRadius: "4px",
      }}
    >
      <div style={{ padding: "5px", fontSize: "14px" }}>Signature Box</div>
    </Rnd>
  );
};

export default FieldOverlay;
