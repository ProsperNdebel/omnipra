import { redirect } from "next/navigation";
import { authEnabled } from "@/server/auth-config";
import { safeNext } from "@/server/session";
import { SignInForm } from "@/ui/sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; expired?: string }>;
}) {
  const { next, expired } = await searchParams;
  if (!authEnabled()) redirect(safeNext(next));
  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">Sign in</h1>
        <p>
          Your agents, their memories and your hosting live in your account. We
          email you a code; no password.
        </p>
        {expired && (
          <p className="error" role="alert">
            That link expired or was already used. Send a new code.
          </p>
        )}
        <SignInForm next={safeNext(next)} />
      </div>
    </main>
  );
}
