/** 보관 배치를 주기적으로 깨우는 기술적 장치. 언제 실제로 도는지는 ArchiveService가 정한다. */
export class ArchiveScheduler {
  constructor({ service, checkIntervalMs, logger = console }) {
    this.service = service;
    this.checkIntervalMs = checkIntervalMs;
    this.logger = logger;
    this.timers = [];
  }

  start() {
    const tick = () => this.service.sweep().catch((error) => this.logger.error(`archive: ${error.message}`));
    this.timers.push(setTimeout(tick, Math.min(30_000, this.checkIntervalMs)));
    this.timers.push(setInterval(tick, this.checkIntervalMs));
    return this;
  }

  stop() {
    for (const timer of this.timers) { clearTimeout(timer); clearInterval(timer); }
    this.timers = [];
  }
}
