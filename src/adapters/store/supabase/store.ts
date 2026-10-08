import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentId, BlobStore, Memory, Observation, Repos } from "@/core";
import { must } from "./client";
import * as R from "./rows";

const AUDIO_BUCKET = "audio";

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
            .select(
              "id, agent_id, manifestation_id, kind, text, importance, alert, entities, evidence, at_sec, created_at",
            )
            .eq("manifestation_id", id)
            .order("created_at"),
          "observations.byManifestation",
        );
        return rows.map(R.observation.from);
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
