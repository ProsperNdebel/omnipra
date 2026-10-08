import { notFound } from "next/navigation";
import type { ManifestationId } from "@/core";
import { access, feed, hostNameFor } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { fmtDay, fmtRange } from "@/ui/format";
import { LiveFeed } from "@/ui/live-feed";

export const dynamic = "force-dynamic";

/** The owner's window into one manifestation: live observations, then the briefing. */
export default async function ManifestationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const d = getDeps();
  const a = await access(d, id as ManifestationId, await viewerId()).catch(() =>
    notFound(),
  );
  if (!a.isOwner) notFound();
  const [initial, name] = await Promise.all([
    feed(d, a, true),
    hostNameFor(d, a),
  ]);
  const hostName = name ?? "the host";

  return (
    <main className="page">
      <h1 className="title">{a.event.title}</h1>
      <p>
        {fmtDay(a.event.startsAt)}, {fmtRange(a.event.startsAt, a.event.endsAt)}
        . {a.agent.name} through {hostName.replace(/\.$/, "")}.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <LiveFeed
        id={a.manifestation.id}
        agentName={a.agent.name}
        hostName={hostName}
        initial={initial}
      />
    </main>
  );
}
