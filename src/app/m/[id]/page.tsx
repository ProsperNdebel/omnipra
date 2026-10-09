import { notFound } from "next/navigation";
import type { ManifestationId } from "@/core";
import {
  access,
  confirmCheckout,
  feed,
  hostNameFor,
  paymentView,
} from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { fmtDay, fmtRange } from "@/ui/format";
import { LiveFeed } from "@/ui/live-feed";
import { PaymentLine } from "@/ui/payment-line";

export const dynamic = "force-dynamic";

/** The owner's window into one manifestation: live observations, then the briefing. */
export default async function ManifestationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; paid?: string }>;
}) {
  const [{ id }, { error, paid: back }] = await Promise.all([
    params,
    searchParams,
  ]);
  const d = getDeps();
  const a = await access(d, id as ManifestationId, await viewerId()).catch(() =>
    notFound(),
  );
  if (!a.isOwner) notFound();
  // Back from checkout: record the hold now rather than waiting for the webhook.
  if (back) await confirmCheckout(d, a.manifestation.id).catch(() => null);
  const [initial, name, payment] = await Promise.all([
    feed(d, a, true),
    hostNameFor(d, a),
    paymentView(d, a.manifestation.id),
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
      <PaymentLine
        id={a.manifestation.id}
        status={a.manifestation.status}
        priceCents={a.manifestation.priceCents}
        payment={payment}
        on={!!d.payments}
        hostName={hostName}
      />
      <LiveFeed
        id={a.manifestation.id}
        agentName={a.agent.name}
        hostName={hostName}
        initial={initial}
      />
    </main>
  );
}
