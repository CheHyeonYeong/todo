import { ArchiveReport } from "../domain/archive-report.js";

/**
 * 보관 컨텍스트의 유스케이스: 오래된 완료 기록을 메일로 내보내고 목록에서 지운다.
 *
 * 순서가 곧 안전장치다. 메일이 실제로 나간 뒤에만 지우고,
 * 한 사용자라도 실패하면 이번 달 실행 기록을 남기지 않아 다음 점검 때 다시 시도한다.
 */
export class ArchiveService {
  constructor({ policy, repository, mailer, directory, journal, clock, months, logger = console }) {
    this.policy = policy;
    this.repository = repository;
    this.mailer = mailer;
    this.directory = directory;
    this.journal = journal;
    this.clock = clock;
    this.months = months;
    this.logger = logger;
    this.running = false;
  }

  /** 지정된 달(기본 6월·12월)에만, 그 달에 아직 안 했을 때만 스윕한다. */
  async sweep() {
    // 스윕이 겹치면 같은 항목이 두 번 메일로 나갈 수 있다.
    if (this.running) return;
    this.running = true;
    try {
      const day = this.clock.today();
      if (!this.months.includes(day.month)) return;
      if ((await this.journal.lastRunMonth()) === day.monthKey) return;
      // 실패한 사용자가 있으면 마커를 안 남겨 다음 체크 때 재시도한다.
      // (성공한 사용자의 항목은 이미 지워졌으므로 다시 메일이 가지 않는다.)
      if (await this.sweepOnce()) await this.journal.recordRun(day.monthKey);
    } finally {
      this.running = false;
    }
  }

  async sweepOnce() {
    const cutoffIso = this.policy.cutoff();
    const report = new ArchiveReport({
      afterMonths: this.policy.afterMonths,
      formatDate: (value) => this.clock.formatDate(value),
      today: this.clock.today().key,
    });
    let allOk = true;
    for (const userId of await this.repository.candidateUserIds(cutoffIso)) {
      try {
        const data = await this.repository.load(userId);
        const todos = this.policy.archivableTodos(data.todos, cutoffIso);
        const sessions = this.policy.archivableSessions(data.sessions, cutoffIso);
        if (todos.length === 0 && sessions.length === 0) continue;
        const email = await this.directory.emailFor(userId);
        if (!email) {
          this.logger.error(`archive: no email for user ${userId}, skipping ${todos.length + sessions.length} items`);
          continue;
        }
        await this.mailer.send(email, report.build(todos, sessions));
        await this.repository.purge(
          { todoIds: todos.map((todo) => todo.id), sessionIds: sessions.map((session) => session.id) },
          userId,
        );
        this.logger.log(
          `archive: exported ${todos.length} todos, ${sessions.length} sessions to ${email} (user ${userId})`,
        );
      } catch (error) {
        allOk = false;
        this.logger.error(`archive: sweep failed for user ${userId}: ${error.message}`);
      }
    }
    return allOk;
  }
}
