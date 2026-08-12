const SCOPE_NAMES = { day: "오늘", week: "이번 주", month: "이번 달" };

/** 보관한 내용을 사용자가 읽을 수 있는 보고서로 만든다. 전송 수단(SMTP)은 모른다. */
export class ArchiveReport {
  constructor({ afterMonths, formatDate, today }) {
    this.afterMonths = afterMonths;
    this.formatDate = formatDate;
    this.today = today;
  }

  build(todos, sessions) {
    const lines = todos
      .filter((todo) => !todo.parentId)
      .map((todo) => {
        const children = todos.filter((child) => child.parentId === todo.id);
        const childLines = children.map((child) => `    - ${child.title}`);
        const tags = [this.formatDate(todo.completedAt), SCOPE_NAMES[todo.scope] || todo.scope, todo.category]
          .filter(Boolean)
          .join(" · ");
        return [`[${tags}] ${todo.title}${todo.note ? `\n    메모: ${todo.note}` : ""}`, ...childLines].join("\n");
      });
    const totalSessionMs = sessions.reduce(
      (sum, session) => sum + Math.max(0, new Date(session.endedAt) - new Date(session.startedAt)),
      0,
    );
    const sessionSummary = sessions.length
      ? `시간 기록 ${sessions.length}개(총 ${Math.round(totalSessionMs / 3600000)}시간)도 함께 보관했습니다.`
      : null;
    return {
      subject: `[Todo] ${this.afterMonths}개월 지난 기록 보관 (할 일 ${lines.length}개, 시간 기록 ${sessions.length}개)`,
      text: [
        `${this.afterMonths}개월이 지난 기록을 보관하고 목록에서 삭제했습니다.`,
        "",
        ...(lines.length ? lines : ["(보관한 할 일 없음)"]),
        ...(sessionSummary ? ["", sessionSummary] : []),
        "",
        "전체 데이터는 첨부된 JSON에 있습니다. 웹앱에 다시 넣고 싶으면 이 파일을 보관해 두세요.",
      ].join("\n"),
      attachment: {
        filename: `todo-archive-${this.today}.json`,
        content: `${JSON.stringify({ todos, sessions }, null, 2)}\n`,
        contentType: "application/json",
      },
    };
  }
}
