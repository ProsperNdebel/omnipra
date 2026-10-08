import { notFound } from "next/navigation";
import type { ManifestationId } from "@/core";
import { access, feed } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { Bar } from "@/ui/bar";
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
  const initial = await feed(d, a.manifestation.id, true);
  const listings = await d.repos.events.listings(a.event.id);
  const endpoint = await d.repos.endpoints.get(a.manifestation.endpointId);
  const hostName =
    listings.find((l) => l.hostId === endpoint?.hostId)?.displayName ??
    "the host";

  return (
    <main className="page">
      <Bar here="agent" />
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
