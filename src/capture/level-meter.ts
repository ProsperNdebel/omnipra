/**
 * Rolling input level, 0 to 1. Drives the live indicator and the
 * "it's quiet, move closer" hint on the host screen.
 */
export class LevelMeter {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  /**
   * Make the audio context inside the tap. Safari only lets one run when it's made
   * during a user gesture; one made later stays suspended and reads silence.
   */
  prime(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      void this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null;
    }
  }

  /** Whether the level is real. When false, a low reading means "unknown", not "quiet". */
  get running(): boolean {
    return this.ctx?.state === "running";
  }

  start(
    stream: MediaStream,
    onLevel: (rms: number) => void,
    everyMs = 500,
  ): void {
    this.prime();
    const ctx = this.ctx;
    if (!ctx) return;
    void ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    this.timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      onLevel(Math.sqrt(sum / buf.length));
    }, everyMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
