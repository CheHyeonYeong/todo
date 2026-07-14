# AI 에이전트 가이드

이 저장소는 todo/메모/타임테이블 웹앱이다. 프론트엔드는 `client/`(React + Vite), API 서버는 `server/server.js`(Node, 무의존성), 터미널 클라이언트는 `cli/todo.js`.

## todo CLI 사용법

사용자의 할 일을 조작할 때는 `todo` CLI를 쓴다. 상세 사용법은 **`skills/todo-cli/SKILL.md`** 를 읽을 것. 핵심 규칙:

- 인자 없는 `todo`는 대화형 TUI를 열므로 에이전트는 실행 금지. 항상 서브커맨드 사용.
- 상태 읽기는 `todo list --json`. `done <번호>`/`rm <번호>`의 번호는 목록 순번이므로 변경 직전에 다시 조회할 것.
- 실수는 `todo undo`로 한 단계 되돌릴 수 있다.
- 로그인 필요 오류가 나면 사용자에게 `todo login`을 직접 실행하도록 안내한다.

## 개발 시 참고

- 로컬 서버(파일 저장 모드, 인증 없음): `PORT=34567 DATA_FILE=/tmp/store.json node server/server.js`
- CLI를 로컬 서버로 돌리기: `TODO_API_BASE=http://localhost:34567 node cli/todo.js list`
- 커밋 메시지에 Co-Authored-By: Claude 트레일러를 넣지 않는다.
