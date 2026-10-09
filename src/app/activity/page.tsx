import Link from "next/link";
import { activity } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { fmtDay, fmtTime } from "@/ui/format";

export const dynamic = "force-dynamic";

/** The account's audit log: what happened, who did it, when. */
export default async function Activity() {
  const rows = await activity(getDeps(), await viewerId());
  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">Activity</h1>
        <p>
          Everything that happened to your sessions, devices and keys, newest
          first. The other side of a session sees its entries too, except
          reports.
        </p>
        {rows.length === 0 ? (
          <p className="muted" style={{ marginTop: 40 }}>
            Nothing yet.
          </p>
        ) : (
          <ul className="rows">
            {rows.map((r) => (
              <li key={r.id}>
                <div>
                  <div>
                    {r.what}
                    {r.about &&
                      (r.href ? (
                        <>
                          , <Link href={r.href}>{r.about}</Link>
                        </>
                      ) : (
                        `, ${r.about}`
                      ))}
                  </div>
                  <div className="small muted">
                    {r.who}
                    {r.detail ? `. ${r.detail}` : ""}
                  </div>
                </div>
                <div className="small muted">
                  {fmtDay(r.at)}, {fmtTime(r.at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
