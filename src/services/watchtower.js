// Vigilancia periódica opcional: refrescar el observador y volver a analizar.
//
// Cuarenta líneas con tres decisiones que conviene no perder al tocarlas.
//
// La guarda de reentrada descarta un ciclo si el anterior sigue en marcha: sin
// ella, un nodo lento acumularía ciclos solapados escribiendo estado a la vez.
// El temporizador se desreferencia para que no impida que el proceso termine. Y
// el primer ciclo se ejecuta de inmediato, sin esperar al intervalo, para que la
// consola tenga datos desde el arranque.
//
// Los errores se registran y NUNCA derriban el proceso: un observador caído no
// debe apagar la consola —además, quedarse sin observador ya es un incidente que
// el propio motor de reglas detecta.
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
