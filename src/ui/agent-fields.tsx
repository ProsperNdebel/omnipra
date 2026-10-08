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
    </>
  );
}
