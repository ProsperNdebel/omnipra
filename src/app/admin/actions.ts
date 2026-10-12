"use server";

import { notFound, redirect } from "next/navigation";
import { ensureAuthUser } from "@/adapters/auth/supabase-admin";
import { LOOK_FOR, type UserId } from "@/core";
import { createAgent } from "@/services";
import { getDeps } from "@/server/deps";
import { goTrue } from "@/server/auth-config";
import { siteOrigin } from "@/server/origin";
import { isAdmin } from "@/server/viewer";

const value = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();

function backError(message: string): never {
  redirect(`/admin?error=${encodeURIComponent(message)}`);
}

export async function provisionAccountAction(form: FormData) {
  if (!(await isAdmin())) notFound();

  const email = value(form, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    backError("Enter a valid email.");

  const starters = [1, 2, 3]
    .map((n) => ({
      name: value(form, `agent${n}Name`),
      profile: value(form, `agent${n}Profile`),
      style: value(form, `agent${n}Style`),
    }))
    .filter((a) => a.name || a.profile || a.style);

  if (starters.length === 0)
    backError("Add at least one starter agent.");
  for (const a of starters) {
    if (!a.name || !a.profile)
      backError("Each starter agent needs a name and brief.");
    if (a.profile.length < 60)
      backError(`${a.name}'s brief needs a few more details.`);
  }

  const d = getDeps();
  let created = 0;
  let ownerId: UserId;

  try {
    const existing = await d.repos.accounts.byEmail(email);
    if (existing) {
      ownerId = existing.userId;
    } else {
      const authId = await ensureAuthUser(email);
      ownerId = crypto.randomUUID() as UserId;
      await d.repos.accounts.provision(authId, ownerId, email);
    }

    for (const starter of starters) {
      await createAgent(d, ownerId, {
        name: starter.name,
        profile: starter.profile,
        style: starter.style,
        lookFor: [...LOOK_FOR],
        card: null,
      });
      created += 1;
    }

    const emailed = form.get("sendLink") === "on";
    if (emailed) {
      const callback = new URL("/auth/callback", await siteOrigin());
      callback.searchParams.set("next", "/agent");
      await goTrue().sendCode(email, callback.toString(), false);
    }

    redirect(
      `/admin?created=${encodeURIComponent(email)}&agents=${created}&emailed=${emailed ? "1" : "0"}`,
    );
  } catch (err) {
    backError(err instanceof Error ? err.message : "Could not provision account.");
  }
}
