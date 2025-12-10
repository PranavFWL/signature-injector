import React, { useState } from "react";

export default function DraggableField({ field, containerRef, onUpdate, onRemove }) {
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const startDrag = (e) => {
    setDragging(true);

    const rect = e.target.getBoundingClientRect();
    setOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const stopDrag = () => {
    setDragging(false);
  };

  const onDrag = (e) => {
    if (!dragging) return;

    const container = containerRef.current.getBoundingClientRect();

    let left = (e.clientX - container.left - offset.x) / container.width;
    let top = (e.clientY - container.top - offset.y) / container.height;

    left = Math.min(Math.max(left, 0), 0.95);
    top = Math.min(Math.max(top, 0), 0.95);

    onUpdate(field.id, { leftPct: left, topPct: top });
  };

  return (
    <div
      onMouseDown={startDrag}
      onMouseUp={stopDrag}
      onMouseMove={onDrag}
      style={{
        position: "absolute",
        left: `${field.leftPct * 100}%`,
        top: `${field.topPct * 100}%`,
        width: `${field.widthPct * 100}%`,
        height: `${field.heightPct * 100}%`,
        border: "1px solid black",
        background: "white",
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        padding: 4,
        cursor: "move",
      }}
    >
      {field.type.toUpperCase()}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(field.id);
        }}
        style={{ marginLeft: "auto", fontSize: 10 }}
      >
        X
      </button>
    </div>
  );
}
