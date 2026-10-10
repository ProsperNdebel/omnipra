import { redirect } from "next/navigation";
import { safeNext } from "@/server/session";
import { FinishSignIn } from "@/ui/finish-sign-in";

export const dynamic = "force-dynamic";

/**
 * Where the sign in email's link lands. Our own template adds token_hash, which the
 * server verifies (any browser, any device). Supabase's default template sends tokens
 * in the URL hash instead, which FinishSignIn handles in the browser.
 */
export default async function AuthCallback({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; token_hash?: string; type?: string }>;
}) {
  const { next, token_hash, type } = await searchParams;
  if (token_hash) {
    const q = new URLSearchParams({
      token_hash,
      type: type ?? "email",
      next: safeNext(next),
    });
    redirect(`/auth/confirm?${q}`);
  }
  return (
    <main className="page">
      <div className="narrow">
        <FinishSignIn next={safeNext(next)} />
      </div>
    </main>
  );
}
