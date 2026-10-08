/**
 * Shown the instant a link is clicked, while the next page renders on the server.
 * Deliberately quiet: a hairline that fills across the top, nothing else.
 */
export default function Loading() {
  return (
    <div className="loading" role="status" aria-label="Loading">
      <i />
    </div>
  );
}
