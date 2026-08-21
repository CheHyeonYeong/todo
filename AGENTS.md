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

## 클라이언트 구조

`client/src/`는 프런트엔드 기능 컨텍스트를 최상위로 둔다: `application/`, `identity/`, `notes/`,
`routines/`, `time/`, `todo/`, `workspace/`. 공통 기반만 `shared/`에 두고 데이터 조립은
`useAppData.ts`, 화면 조립은 `application/`이 담당한다.

각 컨텍스트 안의 역할은 다음과 같다.

| 디렉터리 | 역할 |
| --- | --- |
| `api/` | 서버 응답 그대로의 wire DTO. 컴포넌트에서 직접 사용하지 않는다. |
| `model/types.ts` | 화면과 비즈니스 규칙이 사용하는 프런트엔드 모델 및 DTO 변환 함수 |
| `model/*Rules.ts` | React와 무관한 순수 비즈니스 규칙 |
| `hooks/` | 해당 기능의 API 명령과 낙관적 상태 갱신 |
| `components/` | 기능 화면과 컴포넌트별 `*.styles.ts` |

`App.tsx`는 인증 상태와 앱 셸만 조립한다. 로그인 생명주기는 `identity/`, 내비게이션과
반응형 레이아웃은 `application/`이 소유한다. Expo Router가 예약한 `src/app/`은 사용하지 않는다.
프런트엔드 `App.tsx` 및 `src/**/*.ts(x)` 파일은
200줄을 넘기지 않으며 `npm run check:lines`로 검사한다.
여러 컴포넌트의 스타일을 하나의 큰 파일에 모으지 않는다.

`workspace/hooks/useWorkspaceData.ts`는 단일 스냅샷 로딩·캐시를 소유한다. 최상위
`useAppData.ts`는 이를 기능 훅들과 조립만 하며 비즈니스 로직을 직접 구현하지 않는다.
화면 prop은 `model/store.ts`의 좁은 기능별 타입을 사용한다. 서버 DTO 전체나
`ReturnType<typeof useAppData>`를 화면에 노출하지 않는다.

순수 규칙과 테스트 위치:

| 모듈 | 규칙 |
| --- | --- |
| `todo/model/calendar.ts` | 날짜 키, 주·월 경계, 스코프별 기본 마감일 |
| `time/model/sessionRules.ts` | 순간 메모 판별, 소요 시간, 시각대 겹침 |
| `todo/model/todoRules.ts` | 정렬 순서, 완료 시각, 부모 완료 전파 |
| `notes/model/memoRules.ts` | 태그·할 일 파싱, 본문에서 파생되는 값 |
| `client/tests/<context>/` | 컨텍스트별 순수 규칙 테스트 |

지켜야 할 규칙 두 가지:

- **`model/*Rules.ts`는 순수하게 둔다.** `new Date()`를 안에서 부르지 말고 "지금"을 인자로 받는다.
  자정 경계를 테스트할 수 없게 되는 순간 이 폴더의 존재 이유가 사라진다.
- **규칙을 화면 코드에 다시 인라인하지 않는다.** 새 규칙이 생기면 해당 컨텍스트의 `model/`에 함수로 넣고 테스트를 붙인다.

순수 규칙 모듈은 react-native를 import하지 않으므로 node 환경에서 그대로 테스트된다.

## 검사 명령

```bash
npm run test:server          # 서버 도메인 테스트 (node --test)
cd client && npm test        # 클라이언트 도메인 테스트 (vitest)
cd client && npm run typecheck
cd client && npm run check:lines    # 프런트엔드 소스 파일 200줄 제한
cd client && npm run format        # prettier 적용
cd client && npm run format:check  # CI가 확인하는 것
cd client && npm run build         # Expo 웹 export
npm run e2e                  # Expo 웹 + 파일 모드 API 통합 스모크
```

`.github/workflows/ci.yml`은 PR마다 서버, 클라이언트, 웹 통합 스모크를 별도 잡으로 돌린다.
Expo 배포 빌드는 Vercel도 별도로 검증한다.

## 알려진 문제

고치지 않고 남겨둔 것들. 손대기 전에 배경을 알고 있어야 한다.

- **`sessionsCoveringHour`가 자정을 넘는 기록을 놓친다.** `ended.getHours()`가 절대 시각이 아니라
  벽시계 시각이라, 22시~2시 기록은 어느 칸에도 안 나온다. Expo 이관 전부터 있던 동작이라 그대로 뒀다.
- **기존 메모는 옛 태그를 들고 있다.** 태그 정규식을 고쳤지만 저장된 값은 다음 수정 때까지 안 바뀐다.
  일괄 재계산은 마이그레이션이라 하지 않았다.
- **완료된 할 일이 무한히 쌓인다.** 보관 기능(`server/archiving`)이 SMTP 설정을 요구해서,
  설정이 없으면 정리 수단이 아예 없다.
- **actions 버전이 낡았다.** `@v4`가 Node 20 폐기 경고를 낸다. `release-cli.yml`도 같이 올려야 한다.

## 개발 시 참고

- 로컬 서버(파일 저장 모드, 인증 없음): `PORT=34567 DATA_FILE=/tmp/store.json node server/server.js`
- CLI 빌드: `cd tui && cargo build`
- CLI를 로컬 서버로 돌리기: `TODO_API_BASE=http://localhost:34567 ./tui/target/debug/todo list`
- 커밋 메시지에 Co-Authored-By: Claude 트레일러를 넣지 않는다.
- 리팩토링 PR은 **동작 변경과 순수 이동을 섞지 않는다.** 섞이면 회귀가 났을 때 원인을 못 찾고 부분 롤백도 안 된다.
  포맷만 바꾸는 PR은 `tsc` 출력을 전후 비교해 동일함을 확인할 수 있다.
