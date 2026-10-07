import { notFound } from "next/navigation";
import type { ManifestationId } from "@/core";
import { access } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { HostSession } from "@/ui/host-session";

export const dynamic = "force-dynamic";

/** The phone in the room. Deliberately bare: one clock, one button. */
export default async function HostSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access(getDeps(), id as ManifestationId, await viewerId()).catch(() => notFound());
  if (!a.isHost) notFound();

  return (
    <HostSession
      id={a.manifestation.id}
      agentName={a.agent.name}
      eventTitle={a.event.title}
      initialStatus={a.manifestation.status}
      startedAt={a.manifestation.startedAt}
    />
  );
}
