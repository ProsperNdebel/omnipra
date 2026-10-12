"use server";

import { notFound, redirect } from "next/navigation";
import {
  adminMagicLink,
  ensureAuthUser,
} from "@/adapters/auth/supabase-admin";
import type { UserId } from "@/core";
import { getDeps } from "@/server/deps";
import { siteOrigin } from "@/server/origin";
import { isAdmin } from "@/server/viewer";

const value = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();

function backError(message: string): never {
  redirect(`/admin?error=${encodeURIComponent(message)}`);
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Create only the user's login + Omnipra owner identity. No agents yet. */
export async function provisionAccountAction(form: FormData) {
  if (!(await isAdmin())) notFound();

  const email = value(form, "email").toLowerCase();
  if (!validEmail(email)) backError("Enter a valid email.");

  try {
    const d = getDeps();
    const existing = await d.repos.accounts.byEmail(email);
    if (!existing) {
      const authId = await ensureAuthUser(email);
      const ownerId = crypto.randomUUID() as UserId;
      await d.repos.accounts.provision(authId, ownerId, email);
    }
  } catch (err) {
    backError(err instanceof Error ? err.message : "Could not create account.");
  }

  redirect(`/admin?created=${encodeURIComponent(email)}`);
}

/**
 * Admin convenience for setting up a non-technical user's account.
 * This replaces the current browser session with that user's session, so the
 * normal /agent/new flow can be used exactly as they would use it.
 */
export async function openAccountAction(form: FormData) {
  if (!(await isAdmin())) notFound();

  const email = value(form, "email").toLowerCase();
  if (!validEmail(email)) backError("Enter a valid email.");

  try {
    const account = await getDeps().repos.accounts.byEmail(email);
    if (!account) backError("Create that account first.");

    const callback = new URL("/auth/callback", await siteOrigin());
    callback.searchParams.set("next", "/agent");
    const link = await adminMagicLink(email, callback.toString());
    redirect(link);
  } catch (err) {
    backError(err instanceof Error ? err.message : "Could not open account.");
  }
}
