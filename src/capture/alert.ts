/**
 * Gets the host's attention when the agent asks for something.
 *
 * Phones differ: Android honours navigator.vibrate. iPhones ignore it in every
 * browser, but Safari 18+ gives a haptic tick when a switch input is toggled,
 * and a short chime works once the audio context was made inside a tap.
 */
export class Alerter {
  private ctx: AudioContext | null = null;
  private label: HTMLLabelElement | null = null;

  /** Call inside a tap (Start or Resume) so Safari lets the chime play later. */
  prime(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        this.ctx = null;
      }
    }
    void this.ctx?.resume().catch(() => {});
    if (!this.label) {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.id = "omni-haptic";
      const label = document.createElement("label");
      label.htmlFor = input.id;
      label.setAttribute("aria-hidden", "true");
      label.style.display = "none";
      label.appendChild(input);
      document.body.appendChild(label);
      this.label = label;
    }
  }

  /** Buzz and chime. Each part is best effort; whatever the phone allows happens. */
  notify(): void {
    if (typeof window === "undefined") return;
    if ("vibrate" in navigator) navigator.vibrate([120, 80, 120]);
    else this.label?.click();
    this.chime();
  }

  private chime(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    void ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      const at = t + i * 0.16;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.25, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.15);
    });
  }

  async close(): Promise<void> {
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.label?.remove();
    this.label = null;
  }
}
