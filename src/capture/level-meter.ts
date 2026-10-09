/**
 * Rolling input level, 0 to 1. Drives the live indicator and the
 * "audio is low, move closer" hint on the host screen.
 */
export class LevelMeter {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  start(
    stream: MediaStream,
    onLevel: (rms: number) => void,
    everyMs = 500,
  ): void {
    this.ctx = new AudioContext();
    // Created after an await, outside the tap, so some browsers start it suspended.
    void this.ctx.resume().catch(() => {});
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    this.ctx.createMediaStreamSource(stream).connect(analyser);
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
