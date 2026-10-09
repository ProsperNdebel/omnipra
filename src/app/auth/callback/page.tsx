import { safeNext } from "@/server/session";
import { FinishSignIn } from "@/ui/finish-sign-in";

export const dynamic = "force-dynamic";

/** Where the sign in email's link lands. */
export default async function AuthCallback({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="page">
      <div className="narrow">
        <FinishSignIn next={safeNext(next)} />
      </div>
    </main>
  );
}
