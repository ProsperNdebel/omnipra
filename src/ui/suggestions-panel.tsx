import Link from "next/link";
import { suggestionAction } from "@/app/actions";
import type { SuggestionKind, SuggestionOffer } from "@/core";
import type { SuggestionView } from "@/services";
import { CopyButton } from "./copy-button";
import { clock } from "./format";
import { SubmitButton } from "./submit-button";

const KIND_WORDS: Record<SuggestionKind, string> = {
  connection: "Across your events",
  follow_up: "Worth following up",
  question: "Still unanswered",
};

const OFFER_WORDS: Record<SuggestionOffer, [string, string]> = {
  intro: ["Draft the intro", "Drafting"],
  message: ["Draft a message", "Drafting"],
  watch: ["Watch for this at future events", "Saving"],
};

/**
 * What the agent thinks its owner should do next, worked out after each event. Each
 * suggestion names the notes it rests on; acting on one is a single press.
 */
export function SuggestionsPanel({
  agentId,
  name,
  open,
  drafted,
}: {
  agentId: string;
  name: string;
  open: SuggestionView[];
  drafted: SuggestionView[];
}) {
  if (open.length === 0 && drafted.length === 0) return null;
  return (
    <section id="next" className="narrow">
      <h2 className="section">Something you should know</h2>
      {open.length > 0 && (
        <ul className="rows">
          {open.map((s) => (
            <li className="proposal" key={s.id}>
              <div className="full">
                <div className="small muted">{KIND_WORDS[s.kind]}</div>
                <div style={{ marginTop: 4, fontWeight: 600 }}>{s.text}</div>
                {s.why && (
                  <div className="small muted" style={{ marginTop: 4 }}>
                    {s.why}
                  </div>
                )}
                <Sources s={s} />
                <div className="actions" style={{ marginTop: 12 }}>
                  {s.offer ? (
                    <Act
                      s={s}
                      agentId={agentId}
                      op="accept"
                      pending={OFFER_WORDS[s.offer][1]}
                    >
                      {OFFER_WORDS[s.offer][0]}
                    </Act>
                  ) : (
                    <Act s={s} agentId={agentId} op="accept" pending="Saving">
                      Got it
                    </Act>
                  )}
                  <Act
                    s={s}
                    agentId={agentId}
                    op="dismiss"
                    pending="Dismissing"
                    quiet
                  >
                    Not useful
                  </Act>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {drafted.length > 0 && (
        <>
          <h3 className="group">Drafted by {name}</h3>
          <ul className="rows">
            {drafted.map((s) => (
              <li key={s.id}>
                <div className="full">
                  <div className="small muted">
                    {s.offer === "intro" ? "Intro" : "Message"}
                    {s.target && ` for ${s.target}`}
                  </div>
                  <p className="prose" style={{ marginTop: 8 }}>
                    {s.draft}
                  </p>
                  <Sources s={s} />
                  <div className="actions" style={{ marginTop: 12 }}>
                    <CopyButton text={s.draft ?? ""} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** The notes behind a suggestion, each linking to where it was heard. */
function Sources({ s }: { s: SuggestionView }) {
  if (s.sources.length === 0) return null;
  return (
    <div className="small muted" style={{ marginTop: 6 }}>
      Based on{" "}
      {s.sources.map((src, i) => (
        <span key={src.noteId}>
          {i > 0 && ", "}
          <Link href={`/m/${src.sessionId}#note-${src.noteId}`}>
            {src.eventTitle}
            {src.atSec !== null &&
              ` ${clock(src.atSec).replace(/^0(?=\d:)/, "")}`}
          </Link>
        </span>
      ))}
    </div>
  );
}

function Act({
  s,
  agentId,
  op,
  pending,
  quiet,
  children,
}: {
  s: SuggestionView;
  agentId: string;
  op: "accept" | "dismiss";
  pending: string;
  quiet?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={suggestionAction}>
      <input type="hidden" name="agentId" value={agentId} />
      <input type="hidden" name="id" value={s.id} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton pending={pending} quiet={quiet}>
        {children}
      </SubmitButton>
    </form>
  );
}
