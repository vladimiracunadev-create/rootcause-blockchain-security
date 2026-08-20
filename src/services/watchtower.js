export class Watchtower {
  constructor(service, options) {
    this.service = service;
    this.options = options;
    this.timer = null;
    this.running = false;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.service.refreshNode("watchtower");
      await this.service.scan("watchtower");
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "watchtower_tick_failed",
          message: error.message,
          occurredAt: new Date().toISOString()
        })
      );
    } finally {
      this.running = false;
    }
  }

  start() {
    if (!this.options.enabled || this.timer) return;
    this.timer = setInterval(() => this.tick(), this.options.intervalMs);
    this.timer.unref();
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
