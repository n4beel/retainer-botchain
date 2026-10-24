import React from "react";

export type StatementPanelTone = "sheet" | "inset" | "strip" | "rule";

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: StatementPanelTone;
  padded?: boolean;
}

/**
 * Ledger Statement Sheet & Enclosure.
 * Renders textured warm graphite surfaces with subtle ruled borders.
 */
export default function Panel({
  tone = "sheet",
  padded = true,
  children,
  className = "",
  style,
  ...rest
}: PanelProps) {
  let surfaceBg = "#353535";
  let borderRule = "1px solid #4A4640";

  if (tone === "inset") {
    surfaceBg = "#282828";
    borderRule = "1px solid #3F3C36";
  } else if (tone === "strip") {
    surfaceBg = "#2E2E2E";
    borderRule = "1px solid #4A4640";
  } else if (tone === "rule") {
    surfaceBg = "transparent";
    borderRule = "1px solid #4A4640";
  }

  const paddingStyle = padded ? "p-4 sm:p-6" : "";

  return (
    <div
      className={`relative overflow-hidden rounded-sm transition-colors ${paddingStyle} ${className}`}
      style={{
        backgroundColor: surfaceBg,
        border: borderRule,
        color: "#EDE6DC",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
