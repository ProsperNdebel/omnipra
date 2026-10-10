import { DomainError, type ISODate } from "./ids";

/** What someone on the early access list wants Omnipra for. */
export type LeadIntent = "send" | "host" | "both" | "other";

export const LEAD_INTENTS: { value: LeadIntent; label: string }[] = [
  { value: "send", label: "Send my agent to events I can’t make" },
  { value: "host", label: "Host agents at events I’m going to" },
  { value: "both", label: "Both" },
  { value: "other", label: "Something else" },
];

/** Someone interested who isn't using Omnipra yet. One per email; signing up again updates it. */
export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  intent: LeadIntent;
  /** In their words, mostly for "Something else". */
  note: string;
  /** Where they came from, from ?src= on the link (a QR code at an event, a post). */
  source: string | null;
  createdAt: ISODate;
}

export type LeadInput = Pick<
  Lead,
  "firstName" | "lastName" | "email" | "intent" | "note" | "source"
>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trims and checks what the form sent. Throws a DomainError the person can read. */
export function cleanLead(raw: Record<string, unknown>): LeadInput {
  const str = (k: string, max: number) =>
    typeof raw[k] === "string" ? (raw[k] as string).trim().slice(0, max) : "";
  const firstName = str("firstName", 80);
  const lastName = str("lastName", 80);
  const email = str("email", 200).toLowerCase();
  const intent = str("intent", 10) as LeadIntent;
  const note = str("note", 500);
  const source = str("source", 60).replace(/[^\w.-]/g, "") || null;

  if (!firstName) throw new DomainError("bad_request", "Add your first name.");
  if (!lastName) throw new DomainError("bad_request", "Add your last name.");
  if (!EMAIL.test(email))
    throw new DomainError("bad_request", "That email doesn't look right.");
  if (!LEAD_INTENTS.some((i) => i.value === intent))
    throw new DomainError("bad_request", "Pick what you'd use Omnipra for.");
  return { firstName, lastName, email, intent, note, source };
}

export const leadIntentLabel = (i: LeadIntent) =>
  LEAD_INTENTS.find((x) => x.value === i)?.label ?? i;
