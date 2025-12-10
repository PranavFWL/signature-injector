import React from "react";
import DraggableField from "./DraggableField";

export default function FieldOverlay({ fields, containerRef, onUpdate, onRemove }) {
  return (
    <>
      {fields.map((field) => (
        <DraggableField
          key={field.id}
          field={field}
          containerRef={containerRef}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </>
  );
}
