"use client";

import React, { forwardRef } from "react";

export type LedgerButtonIntent = "primary" | "ghost" | "danger" | "outline";
export type LedgerButtonScale = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: LedgerButtonIntent;
  size?: LedgerButtonScale;
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled = false,
      children,
      className = "",
      style,
      ...rest
    },
    ref
  ) => {
    let bg = "#D4895C";
    let text = "#1E1308";
    let border = "none";

    if (variant === "ghost") {
      bg = "transparent";
      text = "#B3A99A";
      border = "1px solid #4A4640";
    } else if (variant === "outline") {
      bg = "transparent";
      text = "#D4895C";
      border = "1px solid #D4895C";
    } else if (variant === "danger") {
      bg = "rgba(232, 162, 126, 0.12)";
      text = "#E8A27E";
      border = "1px solid rgba(232, 162, 126, 0.4)";
    }

    const scaleClasses =
      size === "sm"
        ? "px-2.5 py-1 text-xs"
        : size === "lg"
        ? "px-5 py-3 text-sm font-semibold tracking-wide"
        : "px-4 py-2 text-xs font-semibold tracking-wide";

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center gap-2 rounded-sm font-sans uppercase transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${scaleClasses} ${className}`}
        style={{
          backgroundColor: bg,
          color: text,
          border,
          ...style,
        }}
        {...rest}
      >
        {loading && (
          <span
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
