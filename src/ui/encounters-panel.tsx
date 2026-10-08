import { introductionAction } from "@/app/actions";
import type { EncounterView } from "@/services";
import { SubmitButton } from "./submit-button";

/**
 * People the agent met through their agents. Its own read of each, a yes or no on an
 * introduction, and the contact once both owners agreed.
 */
export function EncountersPanel({
  agentId,
  name,
  met,
}: {
  agentId: string;
  name: string;
  met: EncounterView[];
}) {
  if (met.length === 0) return null;
  return (
    <section id="met" className="narrow">
      <h2 className="section">People {name} met</h2>
      <ul className="rows">
        {met.map((e) => (
          <li
            key={e.id}
            className={
              e.status === "open" && e.myAnswer === "pending"
                ? "proposal"
                : undefined
            }
          >
            <div className="full">
              <div className="small muted">
                Met their agent at {e.eventTitle}
                {e.theyAsked &&
                  e.status === "open" &&
                  ", and they'd like an introduction"}
              </div>
              <div style={{ marginTop: 4, fontWeight: 600 }}>{e.metName}</div>
              <div className="small" style={{ marginTop: 2 }}>
                {e.metAbout}
              </div>
              <div style={{ marginTop: 8 }}>{e.why}</div>
              {e.status === "introduced" ? (
                <p style={{ marginTop: 8 }}>
                  Introduced.{" "}
                  {e.contact ? (
                    <>
                      Reach them at <strong>{e.contact}</strong>
                    </>
                  ) : (
                    "They didn't leave a contact."
                  )}
                </p>
              ) : e.myAnswer === "yes" ? (
                <p className="small muted" style={{ marginTop: 8 }}>
                  You said yes. Waiting on them.
                </p>
              ) : (
                <div className="actions" style={{ marginTop: 12 }}>
                  <Answer
                    agentId={agentId}
                    id={e.id}
                    answer="yes"
                    pending="Saving"
                  >
                    Introduce us
                  </Answer>
                  <Answer
                    agentId={agentId}
                    id={e.id}
                    answer="no"
                    pending="Saving"
                    quiet
                  >
                    No thanks
                  </Answer>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Answer({
  agentId,
  id,
  answer,
  pending,
  quiet,
  children,
}: {
  agentId: string;
  id: string;
  answer: "yes" | "no";
  pending: string;
  quiet?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={introductionAction}>
      <input type="hidden" name="agentId" value={agentId} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="answer" value={answer} />
      <SubmitButton pending={pending} quiet={quiet}>
        {children}
      </SubmitButton>
    </form>
  );
}
