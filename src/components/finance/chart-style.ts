import type * as React from "react";

/** Shared tooltip look for the finance charts — a lifted surface, no outline. */
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: "hsl(var(--popover))",
  border: "none",
  borderRadius: 10,
  boxShadow: "var(--shadow-lift)",
  fontSize: 12,
  padding: "8px 10px",
};
