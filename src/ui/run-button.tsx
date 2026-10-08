"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Execution } from "@/core";

/**
 * Carries out an action with one executor and finishes it in the browser: opens the
 * link, saves the file, or copies the text. Pressing it is the owner's approval.
 */
export function RunButton({
  actionId,
  executorId,
  label,
  quiet,
}: {
  actionId: string;
  executorId: string;
  label: string;
  quiet?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function go() {
    setState("busy");
    try {
      const res = await fetch(`/api/actions/${actionId}/run/${executorId}`, {
        method: "POST",
      });
      const out = (await res.json()) as Execution & { message?: string };
      if (!res.ok) throw new Error(out.message);
      if (out.copy)
        await navigator.clipboard?.writeText(out.copy).catch(() => {});
      if (out.file) {
        const url = URL.createObjectURL(
          new Blob([out.file.body], { type: out.file.mime }),
        );
        const a = Object.assign(document.createElement("a"), {
          href: url,
          download: out.file.name,
        });
        a.click();
        URL.revokeObjectURL(url);
      }
      if (out.open) window.location.href = out.open;
      setState("idle");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      className={`button${quiet ? " quiet" : ""}`}
      onClick={go}
      disabled={state === "busy"}
    >
      {state === "busy" ? "Working" : state === "error" ? "Try again" : label}
    </button>
  );
}
