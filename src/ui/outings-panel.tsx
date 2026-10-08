import Link from "next/link";
import { outingAction, scoutAction } from "@/app/actions";
import { outingTotal, type Outing } from "@/core";
import { fmtDay, fmtTime } from "./format";
import { SubmitButton } from "./submit-button";

const dollars = (cents: number) =>
  `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/**
 * The agent deciding where it should be. The owner gives a brief and a budget; the
 * agent comes back with a plan; nothing is booked until the owner says so.
 */
export function OutingsPanel({
  agentId,
  name,
  outings,
}: {
  agentId: string;
  name: string;
  outings: Outing[];
}) {
  return (
    <section id="outings" className="narrow">
      <h2 className="section">Where {name} should be</h2>
      <p className="muted small">
        Tell {name} what you&rsquo;re after and what to spend. It ranks
        what&rsquo;s on against your goals, picks hosts, and writes each
        mission. Nothing is booked until you say so.
      </p>

      {outings.map((o) => (
        <OutingCard key={o.id} o={o} agentId={agentId} name={name} />
      ))}

      <form action={scoutAction} className="stack" style={{ marginTop: 20 }}>
        <input type="hidden" name="agentId" value={agentId} />
        <label className="field">
          <span>What should it look for?</span>
          <input
            type="text"
            name="request"
            required
            maxLength={300}
            placeholder="AI infrastructure events where founders and investors talk"
          />
        </label>
        <div style={{ display: "flex", gap: 20 }}>
          <label className="field" style={{ flex: 1 }}>
            <span>Spend up to ($)</span>
            <input
              type="number"
              name="budget"
              min={1}
              max={1000}
              defaultValue={100}
              required
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>In the next</span>
            <select name="days" defaultValue="7">
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
        </div>
        <div className="actions">
          <SubmitButton pending="Looking">Find places for me</SubmitButton>
        </div>
      </form>
    </section>
  );
}

function OutingCard({
  o,
  agentId,
  name,
}: {
  o: Outing;
  agentId: string;
  name: string;
}) {
  const total = outingTotal(o);
  const proposed = o.status === "proposed";
  return (
    <div
      className={proposed ? "proposal" : undefined}
      style={{
        marginTop: 16,
        padding: proposed ? 16 : 0,
        border: proposed ? "1px solid var(--ink)" : undefined,
      }}
    >
      <div className="small muted">
        {proposed ? `${name}'s plan for` : "Booked for"}: &ldquo;{o.request}
        &rdquo;
      </div>
      {o.picks.length === 0 ? (
        <p>
          Nothing on in that window fits. Try a wider brief, more days, or a
          bigger budget.
        </p>
      ) : (
        <ul className="rows">
          {o.picks.map((p, i) => {
            const session = o.manifestationIds[i];
            return (
              <li key={p.eventId}>
                <div className="full">
                  <div className="small muted">
                    {fmtDay(p.startsAt)}, {fmtTime(p.startsAt)}, through{" "}
                    {p.hostName}, {dollars(p.priceCents)}
                  </div>
                  <div style={{ marginTop: 4, fontWeight: 600 }}>
                    {session ? (
                      <Link href={`/m/${session}`}>{p.eventTitle}</Link>
                    ) : (
                      p.eventTitle
                    )}
                  </div>
                  <div className="small" style={{ marginTop: 2 }}>
                    {p.why}
                  </div>
                  <details className="change">
                    <summary className="linkish small">
                      Mission it will carry
                    </summary>
                    <p className="prose small">{p.instructions}</p>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="small" style={{ marginTop: 12 }}>
        {dollars(total)} of {dollars(o.budgetCents)} budget
      </p>
      {o.skipped.length > 0 && (
        <details className="change">
          <summary className="linkish small">
            Passed on {o.skipped.length}
          </summary>
          <ul className="small muted" style={{ marginTop: 8, paddingLeft: 18 }}>
            {o.skipped.map((s) => (
              <li key={s.eventId}>
                {s.title}: {s.why}
              </li>
            ))}
          </ul>
        </details>
      )}
      {proposed && (
        <div className="actions" style={{ marginTop: 12 }}>
          {o.picks.length > 0 && (
            <Decide id={o.id} agentId={agentId} op="book" pending="Booking">
              Book {o.picks.length === 1 ? "it" : `these ${o.picks.length}`} for{" "}
              {dollars(total)}
            </Decide>
          )}
          <Decide
            id={o.id}
            agentId={agentId}
            op="dismiss"
            pending="Dropping"
            quiet
          >
            Not now
          </Decide>
        </div>
      )}
    </div>
  );
}

function Decide({
  id,
  agentId,
  op,
  pending,
  quiet,
  children,
}: {
  id: string;
  agentId: string;
  op: "book" | "dismiss";
  pending: string;
  quiet?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={outingAction}>
      <input type="hidden" name="agentId" value={agentId} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton pending={pending} quiet={quiet}>
        {children}
      </SubmitButton>
    </form>
  );
}
