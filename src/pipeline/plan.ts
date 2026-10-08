import { cleanPlan, DomainError, type MissionId } from "@/core";
import type { Deps } from "./deps";
import { recallMemory } from "./memory";

/**
 * Before the agent goes: turn its owner's standing goals into what to watch for at
 * this particular event. Safe to rerun; it replaces the plan.
 */
export async function draftPlan(d: Deps, missionId: MissionId) {
  const mission = await d.repos.missions.get(missionId);
  if (!mission) throw new DomainError("not_found", "mission not found");
  const [agent, event] = await Promise.all([
    d.repos.agents.get(mission.agentId),
    d.repos.events.get(mission.eventId),
  ]);
  if (!agent || !event)
    throw new DomainError("not_found", "mission is orphaned");

  const memories = await recallMemory(
    d,
    agent.id,
    `${event.title} ${mission.instructions}`,
  );
  const items = await d.agent.plan({ agent, memories, mission, event });

  // Reread so a standing order added meanwhile isn't overwritten.
  const latest = (await d.repos.missions.get(missionId)) ?? mission;
  const plan = cleanPlan(items, d.newId);
  await d.repos.missions.save({ ...latest, plan });
  return plan;
}
