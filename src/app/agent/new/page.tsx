import { createAgentAction } from "@/app/actions";
import { ownerAgents } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { Bar } from "@/ui/bar";

const LOOK_FOR: [string, string][] = [
  ["ideas", "Ideas worth knowing"],
  ["people", "People worth meeting"],
  ["companies", "Companies"],
  ["opportunities", "Opportunities"],
  ["technical_details", "Technical details and numbers"],
  ["open_questions", "Questions left unanswered"],
];

export default async function NewAgent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const first = (await ownerAgents(getDeps(), await viewerId())).length === 0;

  return (
    <main className="page">
      <Bar here="agent" />
      <div className="narrow">
        <h1 className="title">
          {first ? "Make your agent" : "Make another agent"}
        </h1>
        <p>
          {first
            ? "It goes to events for you and remembers what it hears, across every event it attends."
            : "Each agent has its own focus and its own memory. Use separate agents for separate interests."}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <form action={createAgentAction} className="stack">
          {next && <input type="hidden" name="next" value={next} />}
          <label className="field">
            <span>What should it care about?</span>
            <textarea
              name="profile"
              required
              placeholder="I'm building speech AI for African languages. I care about inference costs, datasets, on device models and potential customers. Skip generic AI talk."
            />
            <small>
              Write it like you&rsquo;d brief a sharp colleague. It reads this
              before every event.
            </small>
          </label>
          <fieldset
            className="field"
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <span>What it listens for by default</span>
            <div className="checks">
              {LOOK_FOR.map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    name="lookFor"
                    value={value}
                    defaultChecked
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              name="name"
              required
              maxLength={60}
              defaultValue={first ? "Scout" : undefined}
              placeholder={first ? undefined : "Fundraising scout"}
            />
          </label>
          <button className="button" type="submit">
            Make agent
          </button>
        </form>
      </div>
    </main>
  );
}
