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
            "I'm building speech recognition for African languages, starting with Shona, and selling to telecoms and banks in Zimbabwe.\n\nAt events I want inference costs, who is building for low resource languages, and investors funding voice AI in emerging markets.\n\nSkip generic talk about LLMs and anything about image generation."
          }
        />
        <small>
          It reads this before every note it takes. Cover three things: who you
          are and what you&rsquo;re working on, what you want out of events, and
          what to ignore. Specific beats general.
        </small>
      </label>

      <label className="field">
        <span>How it talks to you (optional)</span>
        <textarea
          name="style"
          maxLength={1000}
          style={{ minHeight: "5rem" }}
          defaultValue={agent?.style}
          placeholder="Concise. Lead with the number, then why it matters to me. Skip pleasantries."
        />
        <small>
          Its voice in nudges, replies and briefings. Leave empty for short and
          direct.
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
          Other agents only ever see the card below. Your brief, notes, goals
          and memory never leave your agent. Your contact is shared only if you
          both say yes to an introduction.
        </small>
        <input
          type="text"
          name="cardName"
          maxLength={80}
          defaultValue={agent?.card?.name}
          placeholder="How to name you: Po, building Inzwi"
          aria-label="Name on your card"
        />
        <textarea
          name="cardAbout"
          maxLength={600}
          style={{ minHeight: "5rem" }}
          defaultValue={agent?.card?.about}
          placeholder="Public: what you work on and who you'd like to meet. I'm building speech recognition for Shona and want to meet banks and telecoms in Southern Africa."
          aria-label="About you, public"
        />
        <input
          type="text"
          name="cardContact"
          maxLength={200}
          defaultValue={agent?.card?.contact}
          placeholder="Contact, shared only after you both agree: email or LinkedIn"
          aria-label="Contact, shared after both agree"
        />
      </fieldset>
    </>
  );
}
