# AI 에이전트 가이드

이 저장소는 todo/메모 앱이다. 클라이언트는 `client/`(React Native + Expo), API 서버는 `server/server.js`(Node, 무의존성),
터미널 클라이언트는 `tui/`(Rust CLI + TUI 단일 바이너리)다.

## todo CLI 사용법

사용자의 할 일을 조작할 때는 `todo` CLI를 쓴다. 상세 사용법은 **`skills/todo-cli/SKILL.md`** 를 읽을 것. 핵심 규칙:

- 인자 없는 `todo`는 대화형 TUI를 열므로 에이전트는 실행 금지. 항상 서브커맨드 사용.
- 상태 읽기는 `todo list --json`. `done <번호>`/`rm <번호>`의 번호는 목록 순번이므로 변경 직전에 다시 조회할 것.
- 실수는 `todo undo`로 한 단계 되돌릴 수 있다.
- 로그인 필요 오류가 나면 사용자에게 `todo login`을 직접 실행하도록 안내한다.

## 스킬

스킬 원본은 `skills/` 하나뿐이다(`todo-cli`, `verify`). 도구별 디렉터리는 링크로 만든다:

```bash
npm run skills   # skills/* -> .claude/skills, .codex/skills, .agents/skills 링크 (클론 후 1회)
```

`.claude/skills` 등은 .gitignore 대상이므로 **스킬을 고칠 때는 `skills/` 원본을 고친다**. 링크라서 바로 반영된다.
다른 저장소/사용자는 `npx skills add CheHyeonYeong/todo` 로 설치할 수 있다.

## 개발 시 참고

- 로컬 서버(파일 저장 모드, 인증 없음): `PORT=34567 DATA_FILE=/tmp/store.json node server/server.js`
- CLI 빌드: `cd tui && cargo build`
- CLI를 로컬 서버로 돌리기: `TODO_API_BASE=http://localhost:34567 ./tui/target/debug/todo list`
- 커밋 메시지에 Co-Authored-By: Claude 트레일러를 넣지 않는다.
