import { createAgentAction } from "@/app/actions";
import { ownerAgents } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { AgentFields } from "@/ui/agent-fields";
import { Bar } from "@/ui/bar";

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
          <AgentFields
            defaultName={first ? "Scout" : undefined}
            namePlaceholder={first ? undefined : "Fundraising scout"}
          />
          <button className="button" type="submit">
            Make agent
          </button>
        </form>
      </div>
    </main>
  );
}
