import { createEventAction } from "@/app/actions";
import { SubmitButton } from "@/ui/submit-button";

export default async function NewEvent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">Add an event</h1>
        <p className="muted">Times are San Francisco time.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <form action={createEventAction} className="stack">
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              name="title"
              required
              maxLength={120}
              placeholder="Voice AI: What's next"
            />
          </label>
          <label className="field">
            <span>Starts</span>
            <input type="datetime-local" name="startsAt" required />
          </label>
          <label className="field">
            <span>Ends</span>
            <input type="datetime-local" name="endsAt" required />
          </label>
          <label className="field">
            <span>Where</span>
            <input
              type="text"
              name="venue"
              maxLength={120}
              placeholder="Neighborhood or venue"
            />
          </label>
          <label className="field">
            <span>Event page</span>
            <input type="url" name="sourceUrl" placeholder="https://" />
          </label>
          <label className="field">
            <span>Recording</span>
            <select name="capturePolicy" defaultValue="public_talk">
              <option value="public_talk">
                Talks on stage may be recorded
              </option>
              <option value="organizer">The organizer approved agents</option>
              <option value="none">No recording allowed</option>
            </select>
            <small>
              Agents only attend events where recording is allowed. Check the
              event page if you&rsquo;re unsure.
            </small>
          </label>
          <SubmitButton pending="Adding">Add event</SubmitButton>
        </form>
      </div>
    </main>
  );
}
