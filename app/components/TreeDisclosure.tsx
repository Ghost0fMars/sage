"use client";

import type { CSSProperties, ReactNode } from "react";

type Props = {
  summary: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  heading?: boolean;
  className?: string;
  style?: CSSProperties;
  contentClassName?: string;
  children: ReactNode;
};

export default function TreeDisclosure({
  summary,
  meta,
  defaultOpen,
  heading = false,
  className = "",
  style,
  contentClassName,
  children
}: Props) {
  return (
    <details open={defaultOpen} style={style} className={`group ${className}`}>
      <summary
        className={`flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden ${
          heading ? "text-xl font-bold text-slate-950" : "py-1 font-semibold text-slate-800"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <svg
            className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
          <span className="min-w-0">{summary}</span>
        </span>
        {meta}
      </summary>
      <div
        className={
          contentClassName ??
          (heading ? "mt-4 grid gap-3 pl-4" : "mt-2 grid gap-2 pl-4")
        }
      >
        {children}
      </div>
    </details>
  );
}
