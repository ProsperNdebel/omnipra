import type { Action, ActionExecutor, ActionKind, ActionPayload } from "@/core";

/**
 * Executors that need no account: everything ends in something the owner opens or
 * saves themselves. Formats are standard (RFC 5545 calendar, vCard 3.0), so they
 * work with any calendar or contacts app.
 */

type Of<K extends ActionKind> = Extract<ActionPayload, { kind: K }>;

const executor = <K extends ActionKind>(
  id: string,
  label: string,
  kinds: K[],
  run: (p: Of<K>, a: Action) => Awaited<ReturnType<ActionExecutor["run"]>>,
): ActionExecutor => ({
  id,
  label,
  handles: (kind) => (kinds as ActionKind[]).includes(kind),
  run: async (a) => run(a.payload as Of<K>, a),
});

export const mailApp = executor(
  "mail-app",
  "Open in your mail app",
  ["email"],
  (p) => ({
    how: "opened in your mail app",
    open: `mailto:${encodeURIComponent(p.to)}?subject=${encodeURIComponent(p.subject)}&body=${encodeURIComponent(p.body)}`,
  }),
);

export const copyText = executor("copy", "Copy", ["email", "note"], (p) => ({
  how: "copied",
  copy:
    p.kind === "email"
      ? `${p.subject}\n\n${p.body}`
      : `${p.title}\n\n${p.body}`,
}));

export const calendarFile = executor(
  "ics",
  "Download the invite",
  ["event"],
  (p, a) => ({
    how: "downloaded the calendar invite",
    file: {
      name: `${slug(p.title)}.ics`,
      mime: "text/calendar",
      body: ics(p, a),
    },
  }),
);

export const contactCard = executor(
  "vcard",
  "Download the contact",
  ["contact"],
  (p) => ({
    how: "downloaded the contact card",
    file: { name: `${slug(p.name)}.vcf`, mime: "text/vcard", body: vcard(p) },
  }),
);

export const noteFile = executor(
  "markdown",
  "Download as markdown",
  ["note"],
  (p) => ({
    how: "downloaded the note",
    file: {
      name: `${slug(p.title)}.md`,
      mime: "text/markdown",
      body: `# ${p.title}\n\n${p.body}\n`,
    },
  }),
);

export const LOCAL_EXECUTORS: ActionExecutor[] = [
  mailApp,
  copyText,
  calendarFile,
  contactCard,
  noteFile,
];

function ics(p: Of<"event">, a: Action): string {
  // No time picked yet: tomorrow at 17:00 UTC (morning in the Americas, evening in
  // Africa and Europe) so the file is valid; the owner moves it in their calendar.
  const now = new Date();
  const start = p.start
    ? new Date(p.start)
    : new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + 1,
          17,
        ),
      );
  const end = new Date(start.getTime() + p.durationMin * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Omnipra//Agent//EN",
    "BEGIN:VEVENT",
    `UID:${a.id}@omnipra`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(p.title)}`,
    `DESCRIPTION:${esc(p.details)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

function vcard(p: Of<"contact">): string {
  const [first, ...rest] = p.name.split(" ");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${esc(p.name)}`,
    `N:${esc(rest.join(" "))};${esc(first ?? "")};;;`,
    p.company && `ORG:${esc(p.company)}`,
    p.role && `TITLE:${esc(p.role)}`,
    p.email && `EMAIL:${esc(p.email)}`,
    p.notes && `NOTE:${esc(p.notes)}`,
    "END:VCARD",
  ].filter(Boolean) as string[];
  return lines.map(fold).join("\r\n") + "\r\n";
}

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const esc = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
/** Lines over 75 octets are folded, per the spec. */
const fold = (line: string) =>
  line.length <= 75 ? line : (line.match(/.{1,74}/g) ?? [line]).join("\r\n ");
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "omnipra";
