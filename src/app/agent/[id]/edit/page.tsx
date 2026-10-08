import Link from "next/link";
import { notFound } from "next/navigation";
import { updateAgentAction } from "@/app/actions";
import { ownedAgent } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { AgentFields } from "@/ui/agent-fields";
import { Bar } from "@/ui/bar";

export const dynamic = "force-dynamic";

export default async function EditAgent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const agent = await ownedAgent(getDeps(), await viewerId(), id).catch(() =>
    notFound(),
  );

  return (
    <main className="page">
      <Bar here="agent" />
      <div className="narrow">
        <p className="small" style={{ marginTop: 40 }}>
          <Link href={`/agent/${agent.id}`}>Back to {agent.name}</Link>
        </p>
        <h1 className="title" style={{ marginTop: 12 }}>
          Edit {agent.name}
        </h1>
        <p>
          Changes apply to the next note it takes, including at events
          it&rsquo;s at right now. Notes it already wrote stay as they are.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <form action={updateAgentAction} className="stack">
          <input type="hidden" name="id" value={agent.id} />
          <AgentFields agent={agent} />
          <div className="actions">
            <button className="button" type="submit">
              Save changes
            </button>
            <Link className="button quiet" href={`/agent/${agent.id}`}>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
