# Todo

todo + timestamp memo + pomodoro 앱.

- 웹: React + Vite + Tailwind + shadcn/ui (`client/`), PWA라 폰 홈 화면에 설치 가능
- API: 의존성 없는 Node 서버 (`server/`), 저장소는 Postgres 또는 로컬 JSON 파일
- 터미널: JS CLI/TUI (`cli/`), Rust TUI (`tui/`)
- 인증: Google 로그인 하나만. 데이터는 사용자별로 분리된다.

## 기능

- 월간/주간/하루 todo 분리, 2뎁스 하위 목표, 카테고리, 마감일
- 모든 메모에 자동 timestamp, `#태그` 자동 추출
- `- [ ] 할 일` / `todo: 할 일` 형태의 메모 줄에서 todo 자동 생성
- 뽀모도로 타이머 (완료 시 알림음 + 브라우저 알림)
- 타임 트래커와 타임테이블 — 스터디 플래너처럼 시간축 그리드에 작업별 색 블록 (일간), 주간은 7일 미니 그리드 + 작업별 합계
- 집중 큐에서 ▶ 로 바로 타임 트래킹 시작
- 오늘 로그, 검색, 태그 필터
- 폰/PC 동기화. memo/todo를 항목 단위로 저장해서 동시 사용 충돌을 줄였다.

## 로컬 개발

```bash
cp .env.example .env
npm install
npm run dev          # http://localhost:3000
```

`DATABASE_URL`이 없으면 로컬 JSON 파일 저장소로 동작하고, `SUPABASE_URL`/`SUPABASE_ANON_KEY`가 없으면 인증 없이 열린다.
둘 다 없는 상태가 로컬 개발 기본값이다. 테이블은 서버가 시작할 때 `ensureSchema`로 자동 생성한다.

프론트엔드만 따로 띄우려면 `cd client && npm install && npm run dev`.

환경변수는 `.env.example`을 참고한다. 프로덕션에서는 `SUPABASE_URL`/`SUPABASE_ANON_KEY`(Google 로그인 JWT 검증)와
`ALLOWED_ORIGINS`(API를 호출할 프론트엔드 origin)를 반드시 채운다. 안 채우면 API가 무인증으로 열린다.

## 터미널 CLI

웹앱과 같은 API를 쓰는 터미널 클라이언트가 `cli/todo.js`에 있다. Node.js 18+만 있으면 되고 저장소 클론은 필요 없다.

```bash
npm install -g https://todo-cohe.vercel.app/cli.tgz
```

업데이트도 같은 명령을 다시 실행하면 된다. 저장소를 클론해 개발 중이라면 `npm link`가 편하다.

```bash
todo login             # 브라우저로 Google 로그인, 토큰은 ~/.config/todo/에 저장
todo                   # 전체화면 TUI
todo add "제목" -w     # 이번 주 할 일 (-m 이번 달, -d 2026-07-20 마감일, -c 카테고리)
todo done 3            # 3번 완료 토글 (todo toggle 3 도 동일)
todo rm 3              # 3번 삭제 (하위 포함)
todo undo              # 마지막 add/done/rm 되돌리기
todo list --json       # 스크립트/AI용 JSON 출력
todo memo "생각 #태그" # 메모 (- [ ] 줄은 할 일로 자동 추출)
todo track "코딩"      # 시간 기록 시작
todo stop              # 기록 종료 -> 타임테이블에 저장
todo log --week        # 이번 주 작업별 시간 합계
```

`todo`를 인자 없이 실행하면 전체화면 TUI가 열리고 바로 Insert 모드로 시작한다. 입력 후 Enter로 오늘 할 일이 추가된다.

- Insert: `↑/↓` 선택, `←/→` 접기/펼치기, `Shift+←/→` 하위로/최상위로, `Shift+↑/↓` 순서 이동, `Esc` Normal 모드
- 입력 중: `←/→`, `Home/End`, `Delete/Backspace`, `Ctrl+←/→`, `Ctrl+W/U/K/A/E`로 커서 이동과 편집
- Normal: `i`/`a`/`Esc` Insert, `s` 하위 목표, `e` 편집, `t` 마감일, `c` 카테고리, `Space` 완료, `d` 삭제, `u` 되돌리기, `hjkl` 이동·접기, `q` 종료
- `Tab`/`Shift+Tab`으로 카테고리 탭 전환. 탭을 고른 상태에서 추가하면 그 카테고리로 만들어지고, `Shift+↑/↓` 순서 이동은 같은 카테고리 안에서만 움직인다.
- `u`는 세션 내 최대 50단계. 추가/완료/삭제/편집/마감일/카테고리/이동을 되돌린다. 삭제 복구는 하위 목표까지 복원한다.
- 하위 목표는 2뎁스까지. 부모 완료는 자식에 전파되고, 자식이 모두 완료되면 부모도 자동 완료된다.
- 지난 마감일은 빨간색. 색은 ANSI 16색만 써서 터미널 테마를 그대로 따라간다.

다른 서버를 쓰려면 `TODO_API_BASE=http://localhost:3000`.

AI 에이전트(Claude Code, Codex CLI, `npx skills`)용 사용법은 `skills/todo-cli/SKILL.md`에 있다.

## Rust TUI

같은 TUI의 [ratatui](https://ratatui.rs) 구현이 `tui/`에 있다. 위 CLI와 같은 API 서버·로그인 세션(`~/.config/todo/session.json`)을
공유하므로 웹/JS CLI와 데이터가 그대로 연동된다 (먼저 `todo login` 필요).

```bash
cd tui
cargo build --release
./target/release/todo-tui
```

키바인딩은 JS TUI와 같다.

## 배포

- 프론트엔드: Vercel. Project Root를 `client`로 두면 `client/vercel.json` 설정으로 자동 빌드된다.
  API 주소는 `client/src/config.ts`에 있고, 첫 접속 때 `?api=` 쿼리로도 지정할 수 있다.
- API 서버: Docker (`docker build -t todo . && docker run -p 3000:3000 --env-file .env todo`) 또는
  systemd (`scripts/install-systemd.sh`). `main` push 시 GitHub Actions가 서버에 배포한다 —
  호스트·계정·경로는 저장소 Actions secrets로 관리한다.
- Vercel이 HTTPS라서 API도 HTTPS여야 한다 (아니면 mixed content로 막힌다).
- DB: Postgres. 앱 런타임은 transaction-mode pooler 연결(`DATABASE_URL`)을 쓴다.

## Google 로그인 설정

Supabase Dashboard -> Authentication -> Providers -> Google을 켜고, Google OAuth에 redirect URI와
JavaScript origin을 등록한다. CLI의 `todo login`을 쓰려면 Authentication -> URL Configuration -> Redirect URLs에
`http://localhost:8787`도 추가한다.

## 앱스토어 배포 (TWA)

PWA라서 Google Play에는 TWA로 올릴 수 있다. https://www.pwabuilder.com 에 배포 URL을 넣어 Android 패키지를 만들고,
Play Console에서 받은 signing key SHA-256 fingerprint를 `client/.well-known/assetlinks.json`에 넣어 배포하면
앱에서 브라우저 주소창이 사라진다. iOS는 웹 래퍼 심사 거절 위험이 커서 Safari -> 공유 -> 홈 화면에 추가를 안내하는 편이 낫다.
