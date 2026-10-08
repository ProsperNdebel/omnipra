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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = getDeps();
  const a = await access(d, id as ManifestationId, await viewerId()).catch(() =>
    notFound(),
  );
  if (!a.isOwner) notFound();
  const [initial, name] = await Promise.all([
    feed(d, a.manifestation.id, true),
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
      <LiveFeed
        id={a.manifestation.id}
        agentName={a.agent.name}
        hostName={hostName}
        initial={initial}
      />
    </main>
  );
}
