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
| `todo/model/calendar.ts` | 날짜 키, 주·월 경계, 월간 격자, 스코프별 기본 마감일 |
| `time/model/sessionRules.ts` | 순간 메모 판별, 소요 시간, 시각대 겹침 |
| `todo/model/todoRules.ts` | 정렬 순서, 완료 시각, 부모 완료 전파 |
| `notes/model/memoRules.ts` | 태그·할 일 파싱, 본문에서 파생되는 값 |
| `client/tests/<context>/` | 컨텍스트별 순수 규칙 테스트 |

지켜야 할 규칙 두 가지:

- **`model/*Rules.ts`는 순수하게 둔다.** `new Date()`를 안에서 부르지 말고 "지금"을 인자로 받는다.
  자정 경계를 테스트할 수 없게 되는 순간 이 폴더의 존재 이유가 사라진다.
- **규칙을 화면 코드에 다시 인라인하지 않는다.** 새 규칙이 생기면 해당 컨텍스트의 `model/`에 함수로 넣고 테스트를 붙인다.

순수 규칙 모듈은 react-native를 import하지 않으므로 node 환경에서 그대로 테스트된다.

### 공통 모듈(`shared/`) 승격 기준

`shared/`는 "종류가 같아서" 모으는 곳이 아니다. **주인이 될 기능이 하나로 정해지지 않는 것만** 올린다.
`Card`를 todo가 가질 이유도 notes가 가질 이유도 없으니 `shared/ui/`에 있는 것이고,
`uid`는 네 컨텍스트가 각자 새 항목을 만들 때 쓰니 `shared/id/`에 있는 것이다.

판정은 한 문장으로 끝난다. **"이걸 소유할 기능이 하나로 정해지나?"** 정해지면 그 컨텍스트의
`model/`이나 `hooks/`에 두고, 안 정해지면 `shared/`로 올린다. 소비자가 여러 곳이어도 주인이
분명하면 올리지 않는다 — `time/model/sessionRules.ts`는 `workspace/`도 쓰지만 시간 기능 것이다.

현재 `shared/`는 여섯 모듈, 도합 50줄이 안 되고 전부 두 개 이상의 컨텍스트가 쓴다.

| 모듈 | 쓰는 컨텍스트 수 |
| --- | --- |
| `ui/Card.tsx` | 5 (notes, routines, time, todo, workspace) |
| `ui/showRequestError.ts` | 5 |
| `api/request.ts` | 5 |
| `id/uid.ts` | 4 (notes, routines, time, todo) |
| `date/weekdayLabels.ts` | 3 (routines, time, todo) |
| `storage/userStorageKeys.ts` | 2 (time, workspace) |

**한 컨텍스트만 쓰는 것이 `shared/`에 들어오는 순간 이 폴더는 잡동사니 서랍이 된다.**
새로 넣기 전에 소비자를 세어볼 것.

#### 알려진 비대칭: `todo/model/calendar.ts`

지금 이 기준이 한 군데서 어긋나 있다. `calendar.ts`의 날짜 연산은 할 일과 무관한 범용 함수인데
`todo/` 안에 있고, 시간 기능이 거기로 손을 뻗는다.

```tsx
// src/time/components/StudyPlanner.tsx:3 — 시간 기능이 할 일 폴더를 참조한다
import { addDays, startOfWeek } from "../../todo/model/calendar";
```

같은 성격의 것이 둘로 갈려 있다는 점이 특히 어색하다. 요일 라벨은 세 컨텍스트가 쓴다고
`shared/date/`로 올렸는데, 정작 날짜 계산은 두 컨텍스트가 쓰면서 `todo/`에 남아 있다.
그래서 `shared/date/`를 열면 요일 라벨 다섯 줄만 있다.

**지금 옮기지 않는 이유:** 외부 소비자가 `StudyPlanner` 하나뿐이고 함수 두 개다. 옮기면 규칙 표,
테스트 경로, import 다섯 곳이 같이 움직이는데 얻는 게 그만큼 안 된다.

**옮기는 시점:** 세 번째 컨텍스트가 `calendar`를 import하는 순간. 그때는 "할 일 것을 빌려 쓴다"는
설명이 더 이상 통하지 않는다.

**옮길 때 할 일:**

- 범용 여섯 개(`dateKey`, `dayKeyOf`, `startOfWeek`, `addDays`, `endOfMonth`, `monthGrid`)를
  `shared/date/calendar.ts`로 옮긴다. 이들은 `Scope`를 모르므로 그대로 떨어진다.
- `defaultDueDate`만 `todo/model/`에 남긴다. 스코프별 기본 마감일은 할 일 규칙이고
  `todo/model/types`의 `Scope`에 의존한다.
- 테스트도 `tests/shared/calendar.test.ts`와 `tests/todo/`로 나눈다.
- import를 고칠 곳은 `TodoCalendar`, `TodoScreen`, `TodoItem`, `StudyPlanner` 넷이다.
- 위 순수 규칙 표의 `calendar.ts` 행도 같이 갱신한다.

#### 정당한 컨텍스트 간 의존 (고치지 말 것)

컨텍스트끼리 참조한다고 전부 잘못된 건 아니다. 아래는 기능 자체의 관계라 그대로 둔다.

- `notes → todo` — 메모 본문에서 할 일을 뽑아내는 기능이라 `useMemoActions`가 `TodoDto`를 만든다.
- `workspace → 전부` — 워크스페이스는 스냅샷 집계 컨텍스트다. 모든 모델을 알아야 한다.
- `application → 각 화면` — 앱 셸이 화면을 조립하는 자리다.
- `time → notes/todo 의 model/types` — `TimeStore` 계약이 `data.todos`, `data.memos`를 포함한다.

컨텍스트가 어디에 손을 뻗는지 확인하려면:

```bash
cd client && grep -rhoP 'from "\.\./\.\./\K[a-z]+' src/<컨텍스트> | sort -u
```

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
- **메모 태그 수정이 Postgres 모드에서 저장되지 않는다.** 클라이언트는 본문이 바뀌면
  `withDerivedTags`로 태그를 다시 계산해 PATCH에 실어 보내지만, `PostgresMemoRepository.update`의
  `set` 절에 `tags`가 없다(`title`/`body`/`starred`만 쓴다). 파일 모드는 `{ ...memo, ...patch }`라
  통과하고 e2e 스모크도 파일 모드라 못 잡는다. 프로덕션에서는 본문을 아무리 고쳐도 옛 태그가 남는다.
  일괄 재계산은 마이그레이션이라 하지 않았다.
- **완료된 할 일이 무한히 쌓인다.** 보관 기능(`server/archiving`)이 SMTP 설정을 요구해서,
  설정이 없으면 정리 수단이 아예 없다.
- **actions 버전이 낡았다.** `@v4`가 Node 20 폐기 경고를 낸다. `release-cli.yml`도 같이 올려야 한다.
- **`ScheduleScreen`이 어디에도 배선돼 있지 않다.** `application/model/navigation.ts`의 `tabs`에
  `schedule`이 없어 도달 경로가 없다. Expo 이관 전 `Screens.tsx` 때부터 그랬다. 살릴 때 고칠 곳은
  `navigation.ts`와 `AppShell` 뿐이고, `useAppData` 반환값이 이미 `ScheduleStore`를 만족한다.
- **`ScheduleScreen`은 순간 메모를 걸러내지 않는다.** 배선하는 순간 `__moment_note__:` 접두사가 붙은
  1초짜리 기록이 "1분"짜리 작업으로 목록에 뜬다. `StudyPlanner`처럼 `isMomentNote`로 빼거나
  `momentNoteText`로 접두사를 벗겨야 한다.
- **`ScheduleScreen`은 날짜를 UTC로 묶는다.** `startedAt.slice(0, 10)`이라 앱의 나머지가 쓰는
  로컬 `dateKey()`와 어긋난다. KST 오전 8시 기록이 전날 헤더 밑에 "08:00"으로 붙고 일별 합계도
  엉뚱한 날에 잡힌다. 배선할 때 같이 고쳐야 한다.
- **레거시 진행 중 세션은 마이그레이션하지 않고 버린다.** 사용자별 키로 옮기면서 전역
  `todo:active-session`을 지우기만 한다(`useTimeActions`). 진행 중 세션은 `stopSession` 전까지
  서버에 사본이 없어 이때 사라진다. 업그레이드 시점에 처음 로그인한 사용자에게 넘기면 공용 기기에서
  남의 타이머를 주게 되므로, 격리를 택하고 손실을 받아들였다. 워크스페이스 캐시도 같은 정책이지만
  그쪽은 서버에서 다시 받으므로 손실이 없다.

## 개발 시 참고

- 로컬 서버(파일 저장 모드, 인증 없음): `PORT=34567 DATA_FILE=/tmp/store.json node server/server.js`
- CLI 빌드: `cd tui && cargo build`
- CLI를 로컬 서버로 돌리기: `TODO_API_BASE=http://localhost:34567 ./tui/target/debug/todo list`
- 커밋 메시지에 Co-Authored-By: Claude 트레일러를 넣지 않는다.
- 리팩토링 PR은 **동작 변경과 순수 이동을 섞지 않는다.** 섞이면 회귀가 났을 때 원인을 못 찾고 부분 롤백도 안 된다.
  포맷만 바꾸는 PR은 `tsc` 출력을 전후 비교해 동일함을 확인할 수 있다.
