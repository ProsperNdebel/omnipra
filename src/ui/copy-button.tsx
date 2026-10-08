"use client";

import { useState } from "react";

/** Copies text and says so. Falls back to nothing worse than a no-op. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="button quiet"
      onClick={async () => {
        await navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
