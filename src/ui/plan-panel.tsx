"use client";

import { editPlanAction, replanAction } from "@/app/actions";
import type { Observation, PlanItem } from "@/core";
import { plural } from "./format";
import { SubmitButton } from "./submit-button";

/**
 * What the agent means to do for its owner's goals at this event, and how far it has
 * got. Progress is counted from notes tagged with the item, so every count links to
 * what was actually heard.
 */
export function PlanPanel({
  id,
  agentName,
  plan,
  notes,
  editable,
}: {
  id: string;
  agentName: string;
  plan: PlanItem[] | null;
  notes: Observation[];
  editable: boolean;
}) {
  if (plan === null && !editable) return null;

  return (
    <section className="narrow" id="plan">
      <h2 className="section">Plan</h2>
      {plan === null ? (
        <>
          <p className="muted">
            {agentName} is drafting a plan from your goals.
          </p>
          <Replan id={id} label="Draft it now" />
        </>
      ) : plan.length === 0 ? (
        <>
          <p className="muted">
            Nothing here touches your goals, so {agentName} is working from your
            instructions.
          </p>
          {editable && <Edit id={id} plan={plan} />}
        </>
      ) : (
        <>
          <ul className="rows">
            {plan.map((p) => {
              const advanced = notes.filter((n) => n.planItem === p.id);
              return (
                <li key={p.id}>
                  <div className="full">
                    <div className="small muted">For: {p.goal}</div>
                    <div style={{ marginTop: 4 }}>{p.watchFor}</div>
                    <div className="small" style={{ marginTop: 4 }}>
                      {advanced.length ? (
                        <a href={`#note-${advanced[0]!.id}`}>
                          {plural(advanced.length, "note")} toward this
                        </a>
                      ) : (
                        <span className="muted">Nothing yet</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {editable && <Edit id={id} plan={plan} />}
        </>
      )}
    </section>
  );
}

function Edit({ id, plan }: { id: string; plan: PlanItem[] }) {
  return (
    <details className="change">
      <summary className="linkish small">Change the plan</summary>
      <form action={editPlanAction} className="stack" style={{ marginTop: 12 }}>
        <input type="hidden" name="manifestationId" value={id} />
        {plan.map((p) => (
          <label className="field" key={p.id}>
            <span className="small muted">For: {p.goal}</span>
            <input type="hidden" name="itemId" value={p.id} />
            <input
              type="text"
              name={`item:${p.id}`}
              defaultValue={p.watchFor}
              maxLength={300}
              aria-label="What to watch for (clear it to remove)"
            />
          </label>
        ))}
        <label className="field">
          <span className="small muted">Add</span>
          <input
            type="text"
            name="added"
            maxLength={300}
            placeholder="Also watch for anyone hiring speech engineers"
          />
        </label>
        <small className="muted">Clear a line to remove it.</small>
        <div className="actions">
          <SubmitButton pending="Saving">Save plan</SubmitButton>
        </div>
      </form>
      <Replan id={id} label="Redraft from my goals" quiet />
    </details>
  );
}

function Replan({
  id,
  label,
  quiet,
}: {
  id: string;
  label: string;
  quiet?: boolean;
}) {
  return (
    <form action={replanAction} style={{ marginTop: 12 }}>
      <input type="hidden" name="manifestationId" value={id} />
      <SubmitButton pending="Planning" quiet={quiet}>
        {label}
      </SubmitButton>
    </form>
  );
}
