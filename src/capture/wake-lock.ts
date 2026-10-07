/**
 * Keeps the screen on while capturing. The browser drops the lock whenever the page
 * is hidden, so we take it again when the page comes back.
 */
export class ScreenWakeLock {
  private lock: WakeLockSentinel | null = null;
  private active = false;
  private readonly onVisible = () => {
    if (this.active && document.visibilityState === "visible") void this.acquire();
  };

  get supported(): boolean {
    return typeof navigator !== "undefined" && "wakeLock" in navigator;
  }

  async enable(): Promise<void> {
    this.active = true;
    document.addEventListener("visibilitychange", this.onVisible);
    await this.acquire();
  }

  async disable(): Promise<void> {
    this.active = false;
    document.removeEventListener("visibilitychange", this.onVisible);
    await this.lock?.release().catch(() => {});
    this.lock = null;
  }

  private async acquire(): Promise<void> {
    if (!this.supported) return;
    try {
      this.lock = await navigator.wakeLock.request("screen");
    } catch {
      // Denied (low battery mode, etc.). Capture still works; the host just has to keep the screen on.
    }
  }
}
