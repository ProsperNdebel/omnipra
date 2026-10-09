import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentAttention,
  AuditEntry,
  UserId,
  AgentId,
  BlobStore,
  Memory,
  Observation,
  Repos,
  SessionContext,
} from "@/core";
import { must } from "./client";
import * as R from "./rows";

const AUDIO_BUCKET = "audio";

/** Note columns, without the full text search vector. */
const OBSERVATION_COLUMNS =
  "id, agent_id, manifestation_id, kind, text, importance, alert, basis, speaker, plan_item, host_request_id, entities, evidence, frames, at_sec, created_at";

/**
 * A session joined to its device, mission, agent and event through foreign keys.
 * !inner makes filters on the embedded tables filter the sessions themselves.
 */
const SESSION_CONTEXT =
  "*, endpoints!inner(*), missions!inner(*, agents!inner(*), events!inner(*))";

type Row = Record<string, unknown>;

/** Repos, BlobStore and Memory on one Supabase project. Implements the same ports as InMemoryStore. */
export class SupabaseStore implements BlobStore, Memory {
  constructor(private readonly db: SupabaseClient) {}

  readonly repos: Repos = {
    agents: {
      get: async (id) => {
        const row = must(
          await this.db.from("agents").select().eq("id", id).maybeSingle(),
          "agents.get",
        );
        return row ? R.agent.from(row) : null;
      },
      byOwner: async (ownerId) => {
        const rows = must(
          await this.db
            .from("agents")
            .select()
            .eq("owner_id", ownerId)
            .order("created_at"),
          "agents.byOwner",
        );
        return rows.map(R.agent.from);
      },
      save: async (a) => {
        must(await this.db.from("agents").upsert(R.agent.to(a)), "agents.save");
      },
    },

    events: {
      get: async (id) => {
        const row = must(
          await this.db.from("events").select().eq("id", id).maybeSingle(),
          "events.get",
        );
        return row ? R.event.from(row) : null;
      },
      save: async (e) => {
        must(await this.db.from("events").upsert(R.event.to(e)), "events.save");
      },
      list: async ({ from, to }) => {
        const rows = must(
          await this.db
            .from("events")
            .select()
            .gte("ends_at", from)
            .lte("starts_at", to)
            .order("starts_at"),
          "events.list",
        );
        return rows.map(R.event.from);
      },
      listings: async (id) => {
        const rows = must(
          await this.db
            .from("host_listings")
            .select()
            .eq("event_id", id)
            .order("price_cents"),
          "events.listings",
        );
        return rows.map(R.listing.from);
      },
      listingsFor: async (ids) => {
        if (ids.length === 0) return [];
        const rows = must(
          await this.db.from("host_listings").select().in("event_id", ids),
          "events.listingsFor",
        );
        return rows.map(R.listing.from);
      },
      saveListing: async (l) => {
        must(
          await this.db.from("host_listings").upsert(R.listing.to(l)),
          "events.saveListing",
        );
      },
    },

    endpoints: {
      get: async (id) => {
        const row = must(
          await this.db.from("endpoints").select().eq("id", id).maybeSingle(),
          "endpoints.get",
        );
        return row ? R.endpoint.from(row) : null;
      },
      byHost: async (hostId) => {
        const rows = must(
          await this.db.from("endpoints").select().eq("host_id", hostId),
          "endpoints.byHost",
        );
        return rows.map(R.endpoint.from);
      },
      byTokenHash: async (hash) => {
        const row = must(
          await this.db
            .from("endpoints")
            .select()
            .eq("token_hash", hash)
            .maybeSingle(),
          "endpoints.byTokenHash",
        );
        return row ? R.endpoint.from(row) : null;
      },
      save: async (e) => {
        must(
          await this.db.from("endpoints").upsert(R.endpoint.to(e)),
          "endpoints.save",
        );
      },
    },

    missions: {
      get: async (id) => {
        const row = must(
          await this.db.from("missions").select().eq("id", id).maybeSingle(),
          "missions.get",
        );
        return row ? R.mission.from(row) : null;
      },
      save: async (m) => {
        must(
          await this.db.from("missions").upsert(R.mission.to(m)),
          "missions.save",
        );
      },
    },

    manifestations: {
      get: async (id) => {
        const row = must(
          await this.db
            .from("manifestations")
            .select()
            .eq("id", id)
            .maybeSingle(),
          "manifestations.get",
        );
        return row ? R.manifestation.from(row) : null;
      },

      byAgent: async (agentId, status) => {
        let q = this.db
          .from("manifestations")
          .select("*, missions!inner(agent_id)")
          .eq("missions.agent_id", agentId)
          .order("created_at", { ascending: false });
        if (status) q = q.eq("status", status);
        return must(await q, "manifestations.byAgent").map(
          R.manifestation.from,
        );
      },

      byEndpoints: async (ids) => {
        if (ids.length === 0) return [];
        const rows = must(
          await this.db
            .from("manifestations")
            .select()
            .in("endpoint_id", ids)
            .order("created_at", { ascending: false }),
          "manifestations.byEndpoints",
        );
        return rows.map(R.manifestation.from);
      },

      save: async (m, expected) => {
        if (expected === null) {
          // Insert only. A duplicate id means someone else created it first.
          const res = await this.db
            .from("manifestations")
            .insert(R.manifestation.to(m));
          if (res.error?.code === "23505") return false;
          must(res, "manifestations.insert");
          return true;
        }
        // Conditional update: matches zero rows if the status moved on, which is our conflict signal.
        const rows = must(
          await this.db
            .from("manifestations")
            .update(R.manifestation.to(m))
            .eq("id", m.id)
            .eq("status", expected)
            .select("id"),
          "manifestations.save",
        );
        return rows.length === 1;
      },

      contexts: async (f) => {
        if (
          [f.ids, f.agentIds, f.endpointIds, f.eventIds].some(
            (x) => x && x.length === 0,
          )
        )
          return [];
        let q = this.db
          .from("manifestations")
          .select(SESSION_CONTEXT)
          .order("created_at", { ascending: false });
        if (f.ids) q = q.in("id", f.ids);
        if (f.agentIds) q = q.in("missions.agent_id", f.agentIds);
        if (f.endpointIds) q = q.in("endpoint_id", f.endpointIds);
        if (f.eventIds) q = q.in("missions.event_id", f.eventIds);
        if (f.status) q = q.eq("status", f.status);
        const rows = must(await q, "manifestations.contexts") as Row[];
        return rows.map((r): SessionContext => {
          const mission = r.missions as Row;
          return {
            manifestation: R.manifestation.from(r),
            endpoint: R.endpoint.from(r.endpoints as Row),
            mission: R.mission.from(mission),
            agent: R.agent.from(mission.agents as Row),
            event: R.event.from(mission.events as Row),
          };
        });
      },
      heard: async (id, at) => {
        must(
          await this.db
            .from("manifestations")
            .update({ last_heard_at: at })
            .eq("id", id),
          "manifestations.heard",
        );
      },
      advanceCursor: async (id, from, to) => {
        const rows = must(
          await this.db
            .from("manifestations")
            .update({ observed_through_sec: to })
            .eq("id", id)
            .eq("observed_through_sec", from)
            .select("id"),
          "manifestations.advanceCursor",
        );
        return rows.length === 1;
      },
    },

    segments: {
      append: async (s) => {
        if (s.length === 0) return;
        must(
          await this.db.from("transcript_segments").upsert(s.map(R.segment.to)),
          "segments.append",
        );
      },
      byIds: async (id, ids) => {
        if (ids.length === 0) return [];
        const rows = must(
          await this.db
            .from("transcript_segments")
            .select()
            .eq("manifestation_id", id)
            .in("id", ids)
            .order("start_sec"),
          "segments.byIds",
        );
        return rows.map(R.segment.from);
      },
      since: async (id, afterSec) => {
        const rows = must(
          await this.db
            .from("transcript_segments")
            .select()
            .eq("manifestation_id", id)
            .gt("end_sec", afterSec)
            .order("start_sec"),
          "segments.since",
        );
        return rows.map(R.segment.from);
      },
    },

    observations: {
      append: async (o) => {
        if (o.length === 0) return;
        must(
          await this.db.from("observations").insert(o.map(R.observation.to)),
          "observations.append",
        );
      },
      byManifestation: async (id) => {
        const rows = must(
          await this.db
            .from("observations")
            .select(OBSERVATION_COLUMNS)
            .eq("manifestation_id", id)
            .order("created_at"),
          "observations.byManifestation",
        );
        return rows.map(R.observation.from);
      },
      byManifestations: async (ids) => {
        if (ids.length === 0) return [];
        const rows = must(
          await this.db
            .from("observations")
            .select(OBSERVATION_COLUMNS)
            .in("manifestation_id", ids)
            .order("created_at"),
          "observations.byManifestations",
        );
        return (rows as Row[]).map(R.observation.from);
      },
      byIds: async (ids) => {
        if (ids.length === 0) return [];
        const rows = must(
          await this.db
            .from("observations")
            .select(OBSERVATION_COLUMNS)
            .in("id", ids),
          "observations.byIds",
        );
        return (rows as Row[]).map(R.observation.from);
      },
    },

    messages: {
      append: async (m) => {
        if (m.length === 0) return;
        must(
          await this.db.from("agent_messages").insert(m.map(R.message.to)),
          "messages.append",
        );
      },
      byManifestation: async (id) => {
        const rows = must(
          await this.db
            .from("agent_messages")
            .select()
            .eq("manifestation_id", id)
            .order("created_at"),
          "messages.byManifestation",
        );
        return rows.map(R.message.from);
      },
      byManifestations: async (ids) => {
        if (ids.length === 0) return [];
        const rows = must(
          await this.db
            .from("agent_messages")
            .select()
            .in("manifestation_id", ids)
            .order("created_at"),
          "messages.byManifestations",
        );
        return rows.map(R.message.from);
      },
    },

    hostRequests: {
      get: async (id) => {
        const row = must(
          await this.db
            .from("host_requests")
            .select()
            .eq("id", id)
            .maybeSingle(),
          "hostRequests.get",
        );
        return row ? R.hostRequest.from(row) : null;
      },
      save: async (r, expected) => {
        if (expected === null) {
          const res = await this.db
            .from("host_requests")
            .insert(R.hostRequest.to(r));
          if (res.error?.code === "23505") return false;
          must(res, "hostRequests.insert");
          return true;
        }
        const rows = must(
          await this.db
            .from("host_requests")
            .update(R.hostRequest.to(r))
            .eq("id", r.id)
            .eq("status", expected)
            .select("id"),
          "hostRequests.save",
        );
        return rows.length === 1;
      },
      byManifestation: async (id) => {
        const rows = must(
          await this.db
            .from("host_requests")
            .select()
            .eq("manifestation_id", id)
            .order("created_at"),
          "hostRequests.byManifestation",
        );
        return rows.map(R.hostRequest.from);
      },
    },

    memories: {
      byAgent: async (agentId) => {
        const rows = must(
          await this.db
            .from("agent_memories")
            .select()
            .eq("agent_id", agentId)
            .order("created_at"),
          "memories.byAgent",
        );
        return rows.map(R.memory.from);
      },
      get: async (id) => {
        const row = must(
          await this.db
            .from("agent_memories")
            .select()
            .eq("id", id)
            .maybeSingle(),
          "memories.get",
        );
        return row ? R.memory.from(row) : null;
      },
      save: async (ms) => {
        if (ms.length === 0) return;
        must(
          await this.db.from("agent_memories").upsert(ms.map(R.memory.to)),
          "memories.save",
        );
      },
      remove: async (id) => {
        must(
          await this.db.from("agent_memories").delete().eq("id", id),
          "memories.remove",
        );
      },
    },

    frames: {
      save: async (f) => {
        must(await this.db.from("frames").upsert(R.frame.to(f)), "frames.save");
      },
      get: async (id) => {
        const row = must(
          await this.db.from("frames").select().eq("id", id).maybeSingle(),
          "frames.get",
        );
        return row ? R.frame.from(row) : null;
      },
    },

    apiKeys: {
      byHash: async (hash) => {
        const row = must(
          await this.db
            .from("api_keys")
            .select()
            .eq("hash", hash)
            .is("revoked_at", null)
            .maybeSingle(),
          "apiKeys.byHash",
        );
        return row ? R.apiKey.from(row) : null;
      },
      byAgent: async (agentId) => {
        const rows = must(
          await this.db
            .from("api_keys")
            .select()
            .eq("agent_id", agentId)
            .order("created_at", { ascending: false }),
          "apiKeys.byAgent",
        );
        return rows.map(R.apiKey.from);
      },
      get: async (id) => {
        const row = must(
          await this.db.from("api_keys").select().eq("id", id).maybeSingle(),
          "apiKeys.get",
        );
        return row ? R.apiKey.from(row) : null;
      },
      save: async (k) => {
        must(
          await this.db.from("api_keys").upsert(R.apiKey.to(k)),
          "apiKeys.save",
        );
      },
    },

    audit: {
      record: async (e) => {
        must(
          await this.db.from("audit_log").insert({
            id: e.id,
            at: e.at,
            actor_id: e.actorId,
            action: e.action,
            subject_kind: e.subject.kind,
            subject_id: e.subject.id,
            involved: e.involved,
            detail: e.detail,
          }),
          "audit.record",
        );
      },
      forUser: async (userId, limit) => {
        const rows = must(
          await this.db
            .from("audit_log")
            .select()
            .contains("involved", [userId])
            .order("at", { ascending: false })
            .limit(limit),
          "audit.forUser",
        ) as Record<string, unknown>[];
        return rows.map((r) => ({
          id: r.id as string,
          at: r.at as string,
          actorId: (r.actor_id as UserId | null) ?? null,
          action: r.action as AuditEntry["action"],
          subject: {
            kind: r.subject_kind as AuditEntry["subject"]["kind"],
            id: r.subject_id as string,
          },
          involved: r.involved as UserId[],
          detail: (r.detail as string | null) ?? null,
        }));
      },
    },
    blocks: {
      isBlocked: async (hostId, ownerId) => {
        const row = must(
          await this.db
            .from("blocks")
            .select("host_id")
            .eq("host_id", hostId)
            .eq("owner_id", ownerId)
            .maybeSingle(),
          "blocks.isBlocked",
        );
        return !!row;
      },
      byHost: async (hostId) => {
        const rows = must(
          await this.db
            .from("blocks")
            .select()
            .eq("host_id", hostId)
            .order("created_at", { ascending: false }),
          "blocks.byHost",
        ) as Record<string, unknown>[];
        return rows.map((r) => ({
          hostId: r.host_id as UserId,
          ownerId: r.owner_id as UserId,
          createdAt: r.created_at as string,
        }));
      },
      save: async (b) => {
        must(
          await this.db
            .from("blocks")
            .upsert(
              {
                host_id: b.hostId,
                owner_id: b.ownerId,
                created_at: b.createdAt,
              },
              { onConflict: "host_id,owner_id", ignoreDuplicates: true },
            ),
          "blocks.save",
        );
      },
      remove: async (hostId, ownerId) => {
        must(
          await this.db
            .from("blocks")
            .delete()
            .eq("host_id", hostId)
            .eq("owner_id", ownerId),
          "blocks.remove",
        );
      },
    },
    reports: {
      save: async (r) => {
        must(
          await this.db.from("reports").insert({
            id: r.id,
            reporter_id: r.reporterId,
            manifestation_id: r.manifestationId,
            agent_id: r.agentId,
            reason: r.reason,
            created_at: r.createdAt,
          }),
          "reports.save",
        );
      },
    },
    accounts: {
      claim: async (authId, guestId, email) => {
        const find = async () =>
          (
            must(
              await this.db
                .from("accounts")
                .select("user_id")
                .eq("auth_user_id", authId)
                .maybeSingle(),
              "accounts.find",
            ) as { user_id: UserId } | null
          )?.user_id;
        const existing = await find();
        if (existing) return existing;
        for (const userId of [guestId, authId]) {
          const { error } = await this.db.from("accounts").insert({
            auth_user_id: authId,
            user_id: userId,
            email,
          });
          if (!error) return userId as UserId;
          // 23505: the guest is someone else's (try a fresh user) or a parallel sign in won.
          if (error.code !== "23505")
            throw new Error(`accounts.claim: ${error.message}`);
          const raced = await find();
          if (raced) return raced;
        }
        throw new Error("accounts.claim: could not create the account");
      },
    },
    encounters: {
      byAgent: async (agentId) => {
        const rows = must(
          await this.db
            .from("agent_encounters")
            .select()
            .or(`agent_a.eq.${agentId},agent_b.eq.${agentId}`)
            .order("created_at", { ascending: false }),
          "encounters.byAgent",
        );
        return rows.map(R.encounter.from);
      },
      get: async (id) => {
        const row = must(
          await this.db
            .from("agent_encounters")
            .select()
            .eq("id", id)
            .maybeSingle(),
          "encounters.get",
        );
        return row ? R.encounter.from(row) : null;
      },
      exists: async (eventId, a, b) => {
        const rows = must(
          await this.db
            .from("agent_encounters")
            .select("id")
            .eq("event_id", eventId)
            .or(
              `and(agent_a.eq.${a},agent_b.eq.${b}),and(agent_a.eq.${b},agent_b.eq.${a})`,
            )
            .limit(1),
          "encounters.exists",
        );
        return rows.length > 0;
      },
      save: async (e) => {
        must(
          await this.db.from("agent_encounters").upsert(R.encounter.to(e)),
          "encounters.save",
        );
      },
    },

    outings: {
      byAgent: async (agentId) => {
        const rows = must(
          await this.db
            .from("agent_outings")
            .select()
            .eq("agent_id", agentId)
            .order("created_at", { ascending: false }),
          "outings.byAgent",
        );
        return rows.map(R.outing.from);
      },
      get: async (id) => {
        const row = must(
          await this.db
            .from("agent_outings")
            .select()
            .eq("id", id)
            .maybeSingle(),
          "outings.get",
        );
        return row ? R.outing.from(row) : null;
      },
      save: async (o) => {
        must(
          await this.db.from("agent_outings").upsert(R.outing.to(o)),
          "outings.save",
        );
      },
    },

    attention: {
      get: async (agentId) => {
        const row = must(
          await this.db
            .from("agent_attention")
            .select("state")
            .eq("agent_id", agentId)
            .maybeSingle(),
          "attention.get",
        );
        return ((row as { state?: unknown } | null)?.state ??
          null) as AgentAttention | null;
      },
      claim: async (agentId, now, everySec) => {
        const won = must(
          await this.db.rpc("claim_attention", {
            p_agent: agentId,
            p_now: now,
            p_every: everySec,
          }),
          "attention.claim",
        );
        return won === true;
      },
      save: async (a) => {
        must(
          await this.db
            .from("agent_attention")
            .update({ state: a })
            .eq("agent_id", a.agentId),
          "attention.save",
        );
      },
    },

    actions: {
      byAgent: async (agentId) => {
        const rows = must(
          await this.db
            .from("agent_actions")
            .select()
            .eq("agent_id", agentId)
            .order("created_at", { ascending: false }),
          "actions.byAgent",
        );
        return rows.map(R.action.from);
      },
      get: async (id) => {
        const row = must(
          await this.db
            .from("agent_actions")
            .select()
            .eq("id", id)
            .maybeSingle(),
          "actions.get",
        );
        return row ? R.action.from(row) : null;
      },
      save: async (as) => {
        if (as.length === 0) return;
        must(
          await this.db.from("agent_actions").upsert(as.map(R.action.to)),
          "actions.save",
        );
      },
    },

    suggestions: {
      byAgent: async (agentId) => {
        const rows = must(
          await this.db
            .from("agent_suggestions")
            .select()
            .eq("agent_id", agentId)
            .order("created_at", { ascending: false }),
          "suggestions.byAgent",
        );
        return rows.map(R.suggestion.from);
      },
      get: async (id) => {
        const row = must(
          await this.db
            .from("agent_suggestions")
            .select()
            .eq("id", id)
            .maybeSingle(),
          "suggestions.get",
        );
        return row ? R.suggestion.from(row) : null;
      },
      save: async (ss) => {
        if (ss.length === 0) return;
        must(
          await this.db
            .from("agent_suggestions")
            .upsert(ss.map(R.suggestion.to)),
          "suggestions.save",
        );
      },
    },

    askTurns: {
      append: async (t) => {
        must(
          await this.db.from("ask_turns").insert(R.askTurn.to(t)),
          "askTurns.append",
        );
      },
      recent: async (agentId, limit) => {
        const rows = must(
          await this.db
            .from("ask_turns")
            .select()
            .eq("agent_id", agentId)
            .order("created_at", { ascending: false })
            .limit(limit),
          "askTurns.recent",
        );
        return rows.map(R.askTurn.from).reverse();
      },
      clear: async (agentId) => {
        must(
          await this.db.from("ask_turns").delete().eq("agent_id", agentId),
          "askTurns.clear",
        );
      },
    },

    briefings: {
      get: async (id) => {
        const row = must(
          await this.db
            .from("briefings")
            .select()
            .eq("manifestation_id", id)
            .maybeSingle(),
          "briefings.get",
        );
        return row ? R.briefing.from(row) : null;
      },
      save: async (b) => {
        must(
          await this.db.from("briefings").upsert(R.briefing.to(b)),
          "briefings.save",
        );
      },
    },
  };

  // BlobStore ---------------------------------------------------------------

  async put(key: string, bytes: Uint8Array, mimeType: string): Promise<void> {
    const { error } = await this.db.storage
      .from(AUDIO_BUCKET)
      .upload(key, bytes, { contentType: baseType(mimeType), upsert: true });
    if (error) throw new Error(`blobs.put ${key}: ${error.message}`);
  }

  async get(key: string): Promise<Uint8Array> {
    const { data, error } = await this.db.storage
      .from(AUDIO_BUCKET)
      .download(key);
    if (error || !data)
      throw new Error(`blobs.get ${key}: ${error?.message ?? "no data"}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  // Memory: the search column is maintained by a trigger, so index has nothing to do.

  async index(): Promise<void> {}

  async recall(
    agentId: AgentId,
    query: string,
    limit: number,
  ): Promise<Observation[]> {
    const rows = must(
      await this.db.rpc("recall_observations", {
        p_agent: agentId,
        p_query: query,
        p_limit: limit,
      }),
      "memory.recall",
    ) as Record<string, unknown>[];
    return rows.map(R.observation.from);
  }
}

/** Storage validates content type against an allowlist; codec parameters can trip it. */
function baseType(mime: string): string {
  return mime.split(";")[0]?.trim() || "application/octet-stream";
}
