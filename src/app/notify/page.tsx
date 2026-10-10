import type { Metadata } from "next";
import { EarlyAccess } from "@/ui/early-access";

export const metadata: Metadata = {
  title: "Get notified · Omnipra",
  description: "Join the Omnipra early access list.",
};

/** The early access list: for people interested in Omnipra who aren't using it yet. */
export default function Notify() {
  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">Get notified</h1>
        <p className="lede">
          We&rsquo;re opening Omnipra event by event. Leave your details and
          we&rsquo;ll let you know when it&rsquo;s your turn.
        </p>
        <EarlyAccess />
      </div>
    </main>
  );
}
