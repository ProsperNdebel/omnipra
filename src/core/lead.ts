import { DomainError, type ISODate } from "./ids";

/** What someone on the early access list wants Omnipra for. */
export type LeadIntent = "send" | "host" | "both" | "other";

export const LEAD_INTENTS: { value: LeadIntent; label: string }[] = [
  { value: "send", label: "Send my agent to events I can’t make" },
  { value: "host", label: "Host agents at events I’m going to" },
  { value: "both", label: "Both" },
  { value: "other", label: "Something else" },
];

/** Whether they're up for a call to talk it through. */
export type LeadChat = "yes" | "maybe" | "no";

export const LEAD_CHAT: { value: LeadChat; label: string }[] = [
  { value: "yes", label: "Hell yeah" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No way" },
];

/** Whether they want us to build their Entwin, their AI twin. Same answers, own wording. */
export const LEAD_TWIN: { value: LeadChat; label: string }[] = [
  { value: "yes", label: "Hell yeah" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Uh, no way" },
];

/** Someone interested who isn't using Omnipra yet. One per email; signing up again updates it. */
export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Optional, as they typed it. */
  phone: string;
  intent: LeadIntent;
  /** Want us to build their Entwin? */
  twin: LeadChat;
  chat: LeadChat;
  /** In their words, mostly for "Something else". */
  note: string;
  /** Where they came from, from ?src= on the link (a QR code at an event, a post). */
  source: string | null;
  createdAt: ISODate;
}

export type LeadInput = Pick<
  Lead,
  "firstName" | "lastName" | "email" | "phone" | "intent" | "twin" | "chat" | "note" | "source"
>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Loose on purpose: digits with the usual separators, any country. */
const PHONE = /^\+?[\d\s().-]{7,25}$/;

/** Trims and checks what the form sent. Throws a DomainError the person can read. */
export function cleanLead(raw: Record<string, unknown>): LeadInput {
  const str = (k: string, max: number) =>
    typeof raw[k] === "string" ? (raw[k] as string).trim().slice(0, max) : "";
  const firstName = str("firstName", 80);
  const lastName = str("lastName", 80);
  const email = str("email", 200).toLowerCase();
  const phone = str("phone", 30);
  const intent = str("intent", 10) as LeadIntent;
  const twin = str("twin", 10) as LeadChat;
  const chat = str("chat", 10) as LeadChat;
  const note = str("note", 500);
  const source = str("source", 60).replace(/[^\w.-]/g, "") || null;

  if (!firstName) throw new DomainError("bad_request", "Add your first name.");
  if (!lastName) throw new DomainError("bad_request", "Add your last name.");
  if (!EMAIL.test(email))
    throw new DomainError("bad_request", "That email doesn't look right.");
  if (phone && !PHONE.test(phone))
    throw new DomainError("bad_request", "That phone number doesn't look right.");
  if (!LEAD_INTENTS.some((i) => i.value === intent))
    throw new DomainError("bad_request", "Pick what you'd use Omnipra for.");
  if (!LEAD_TWIN.some((c) => c.value === twin))
    throw new DomainError("bad_request", "Pick whether you'd like an Entwin.");
  if (!LEAD_CHAT.some((c) => c.value === chat))
    throw new DomainError("bad_request", "Pick whether we can reach out.");
  return { firstName, lastName, email, phone, intent, twin, chat, note, source };
}

export const leadIntentLabel = (i: LeadIntent) =>
  LEAD_INTENTS.find((x) => x.value === i)?.label ?? i;

export const leadChatLabel = (c: LeadChat) =>
  LEAD_CHAT.find((x) => x.value === c)?.label ?? c;

export const leadTwinLabel = (c: LeadChat) =>
  LEAD_TWIN.find((x) => x.value === c)?.label ?? c;
