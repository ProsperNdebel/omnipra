import type { AudioInput, TranscriptionProvider, TranscriptSegment } from "@/core";

/**
 * Deepgram prerecorded API over plain fetch (no SDK, one less dependency).
 * Each chunk is a standalone file, so prerecorded is the right endpoint; streaming
 * would buy a few seconds of latency at the cost of a socket per host.
 */
export class DeepgramTranscriber implements TranscriptionProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = "nova-3",
  ) {}

  async transcribe(input: AudioInput): Promise<Omit<TranscriptSegment, "id" | "manifestationId">[]> {
    const params = new URLSearchParams({
      model: this.model,
      smart_format: "true",
      punctuate: "true",
      diarize: "true",
      utterances: "true",
    });

    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: { Authorization: `Token ${this.apiKey}`, "Content-Type": baseType(input.mimeType) },
      body: new Blob([input.bytes as Uint8Array<ArrayBuffer>]),
    });
    if (!res.ok) throw new Error(`Deepgram ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as DeepgramResponse;
    return (body.results?.utterances ?? []).map((u) => ({
      // Diarization is per chunk, so speaker 0 in chunk 3 is not necessarily speaker 0 in chunk 4.
      // Labels are hints for the agent, not identities.
      speaker: u.speaker === undefined ? null : `S${u.speaker}`,
      text: u.transcript,
      startSec: input.offsetSec + u.start,
      endSec: input.offsetSec + u.end,
    }));
  }
}

/** "audio/webm;codecs=opus" -> "audio/webm". Deepgram sniffs the codec itself. */
function baseType(mime: string): string {
  return mime.split(";")[0]?.trim() || "application/octet-stream";
}

interface DeepgramResponse {
  results?: {
    utterances?: { start: number; end: number; transcript: string; speaker?: number }[];
  };
}
