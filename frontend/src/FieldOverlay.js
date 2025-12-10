// frontend/src/FieldOverlay.js
import React, { useEffect } from "react";
import { Rnd } from "react-rnd";

/**
 * Props:
 * - pageIndex (number)             // provided by parent
 * - pdfWidth, pdfHeight (numbers)
 * - signatureBase64 (string)
 * - initialField {leftPct,topPct,widthPct,heightPct,pageIndex}
 * - onChangePosition({ leftPct, topPct, widthPct, heightPct })
 *
 * This component draws the draggable/resizable signature box (single instance).
 * It uses the percent coords relative to pdfWidth/pdfHeight.
 */
const FieldOverlay = ({
  pageIndex,
  pdfWidth,
  pdfHeight,
  signatureBase64,
  initialField,
  onChangePosition,
}) => {
  // compute default px sizes from initialField if available,
  // otherwise fallback to centered-bottom defaults (200x80)
  const defaultWidthPx = (() => {
    if (initialField && initialField.widthPct) {
      return Math.max(20, Math.round(initialField.widthPct * pdfWidth));
    }
    return Math.min(200, Math.round(pdfWidth * 0.4));
  })();

  const defaultHeightPx = (() => {
    if (initialField && initialField.heightPct) {
      return Math.max(10, Math.round(initialField.heightPct * pdfHeight));
    }
    return Math.round(defaultWidthPx * 0.4);
  })();

  const defaultLeftPx = (() => {
    if (initialField && initialField.leftPct) {
      return Math.round(initialField.leftPct * pdfWidth);
    }
    // center
    return Math.round(pdfWidth / 2 - defaultWidthPx / 2);
  })();

  const defaultTopPx = (() => {
    if (initialField && initialField.topPct) {
      return Math.round(initialField.topPct * pdfHeight);
    }
    // bottom with margin
    return Math.round(pdfHeight - defaultHeightPx - 40);
  })();

  // initialize position once when mounted
  useEffect(() => {
    if (!onChangePosition) return;
    onChangePosition({
      leftPct: defaultLeftPx / pdfWidth,
      topPct: defaultTopPx / pdfHeight,
      widthPct: defaultWidthPx / pdfWidth,
      heightPct: defaultHeightPx / pdfHeight,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // image url
  const sigUrl = signatureBase64 ? `data:image/png;base64,${signatureBase64}` : "";

  return (
    <Rnd
      default={{
        x: defaultLeftPx,
        y: defaultTopPx,
        width: defaultWidthPx,
        height: defaultHeightPx,
      }}
      bounds="parent"
      onDragStop={(e, d) => {
        const leftPct = d.x / pdfWidth;
        const topPct = d.y / pdfHeight;
        onChangePosition({ leftPct, topPct });
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        const widthPx = ref.offsetWidth;
        const heightPx = ref.offsetHeight;
        const leftPct = position.x / pdfWidth;
        const topPct = position.y / pdfHeight;
        onChangePosition({
          leftPct,
          topPct,
          widthPct: widthPx / pdfWidth,
          heightPct: heightPx / pdfHeight,
        });
      }}
      lockAspectRatio={false}
      style={{
        border: "2px solid #007bff",
        backgroundColor: "rgba(255,255,255,0.9)",
        borderRadius: 4,
        cursor: "move",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* signature image fits inside */}
      {sigUrl ? (
        <img
          src={sigUrl}
          alt="signature"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      ) : (
        <div style={{ padding: 6, fontSize: 13 }}>Signature</div>
      )}
    </Rnd>
  );
};

export default FieldOverlay;
