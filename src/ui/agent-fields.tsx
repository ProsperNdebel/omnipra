import type { Agent } from "@/core";

const LOOK_FOR: [string, string][] = [
  ["ideas", "Ideas worth knowing"],
  ["people", "People worth meeting"],
  ["companies", "Companies"],
  ["opportunities", "Opportunities"],
  ["technical_details", "Technical details and numbers"],
  ["open_questions", "Questions left unanswered"],
];

/**
 * The fields that make an agent who it is. Shared by create and edit so both
 * ask for the same thing in the same words.
 */
export function AgentFields({
  agent,
  defaultName,
  namePlaceholder,
}: {
  agent?: Agent;
  defaultName?: string;
  namePlaceholder?: string;
}) {
  return (
    <>
      <label className="field">
        <span>Brief your agent</span>
        <textarea
          name="profile"
          required
          minLength={60}
          style={{ minHeight: "12rem" }}
          defaultValue={agent?.profile}
          placeholder={
            "I build fintech tools for U.S. small businesses. Find customers and investors. Skip crypto."
          }
        />
        <small>
          Say what you do, what you want, and what to ignore.
        </small>
      </label>

      <label className="field">
        <span>How it talks to you (optional)</span>
        <textarea
          name="style"
          maxLength={1000}
          style={{ minHeight: "5rem" }}
          defaultValue={agent?.style}
          placeholder="Short and direct."
        />
        <small>
          Leave blank for short and direct.
        </small>
      </label>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <span>What it listens for</span>
        <div className="checks">
          {LOOK_FOR.map(([value, label]) => (
            <label key={value}>
              <input
                type="checkbox"
                name="lookFor"
                value={value}
                defaultChecked={
                  agent ? agent.lookFor.includes(value as never) : true
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Name</span>
        <input
          type="text"
          name="name"
          required
          maxLength={60}
          defaultValue={agent?.name ?? defaultName}
          placeholder={namePlaceholder}
        />
      </label>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <span>Meeting other agents</span>
        <label style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            name="cardOpen"
            defaultChecked={!!agent?.card}
            style={{ marginTop: 4, flex: "none" }}
          />
          <span>
            Let it meet other people&rsquo;s agents at events and suggest
            introductions.
          </span>
        </label>
        <small>
          Other agents see only this card. Contact is shared after both sides agree.
        </small>
        <input
          type="text"
          name="cardName"
          maxLength={80}
          defaultValue={agent?.card?.name}
          placeholder="How to introduce you: Alex, founder at Acme"
          aria-label="How to introduce you"
        />
        <textarea
          name="cardAbout"
          maxLength={600}
          style={{ minHeight: "5rem" }}
          defaultValue={agent?.card?.about}
          placeholder="Building fintech in the U.S. Looking to meet founders and investors."
          aria-label="About you, public"
        />
        <input
          type="text"
          name="cardContact"
          maxLength={200}
          defaultValue={agent?.card?.contact}
          placeholder="alex@example.com or LinkedIn"
          aria-label="Contact, shared after both agree"
        />
      </fieldset>
    </>
  );
}
