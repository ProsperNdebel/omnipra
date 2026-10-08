"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A form's submit button that answers the click immediately: it disables and
 * says what's happening while the server action runs, so it never feels dead.
 */
export function SubmitButton({
  children,
  pending,
  quiet = false,
}: {
  children: ReactNode;
  /** What to show while it works, e.g. "Saving". */
  pending: string;
  quiet?: boolean;
}) {
  const status = useFormStatus();
  return (
    <button
      type="submit"
      className={`button${quiet ? " quiet" : ""}`}
      disabled={status.pending}
      aria-busy={status.pending}
    >
      {status.pending ? pending : children}
    </button>
  );
}
