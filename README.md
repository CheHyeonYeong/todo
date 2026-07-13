# Free ADHD Memo

todo + timestamp memo + pomodoro 앱입니다.

## 1차 배포 방향

- 추천: 가벼운 Node 서버 + Supabase Postgres
  - 구조는 Vercel 정적 FE -> OCI Node API -> Supabase DB입니다.
  - 클라이언트 코드는 `client/`, API 서버 코드는 `server/`에 분리되어 있습니다.
  - Oracle 1GB VPS에도 충분합니다.
  - 인증은 Supabase Google Auth 하나만 씁니다. `SUPABASE_URL`/`SUPABASE_ANON_KEY`를 설정하지 않으면 API가 완전히 무인증 상태로 열립니다.
  - 분리 배포에서는 로그인 후 `Authorization: Bearer` 토큰으로 API를 호출합니다.
  - 앱 런타임 DB 연결은 Supabase shared transaction-mode pooler `:6543`을 씁니다.
- Docker 배포
  - `docker build -t free-adhd-memo .`
  - `docker run -p 3000:3000 --env-file .env free-adhd-memo`

## 기능

- 월간/주간/하루 todo 분리
- 모든 메모에 자동 timestamp 기록
- `#태그` 자동 추출
- `- [ ] 할 일` 또는 `todo: 할 일` 형태 메모에서 todo 자동 생성
- 오늘 로그, 검색, 태그 필터
- 뽀모도로 타이머 (완료 시 알림음 + 브라우저 알림)
- 타임 트래커와 타임테이블 (몇 시부터 몇 시까지 뭘 했는지 기록. 집중 뽀모도로는 완료하거나 중간에 멈춰도 1분 이상이면 자동 기록, 화면이 꺼져 있어도 시간이 정확함)
- 타임테이블은 스터디 플래너처럼 시간축 그리드에 작업별 색깔 블록으로 표시 (일간), 주간은 7일 미니 그리드 + 작업별 합계
- 집중 큐에서 ▶ 버튼으로 바로 타임 트래킹 시작
- todo 제목 인라인 수정 (✎ 버튼)
- 오늘의 집중 큐
- PWA: 폰 홈 화면에 설치 가능, 오프라인에서도 열림 (`client/manifest.webmanifest`, `client/sw.js`, 아이콘은 `node scripts/generate-icons.mjs`로 재생성)
- 폰/PC 간 서버 동기화
- memo/todo 항목 단위 저장으로 폰과 PC의 동시 사용 충돌 완화
- Google 로그인 사용자별 memo/todo 분리

## 개발

Supabase SQL Editor에서 먼저 실행합니다.

```sql
create table if not exists public.memos (
  id text primary key,
  user_id text not null default 'default',
  body text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null,
  starred boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.todos (
  id text primary key,
  user_id text not null default 'default',
  title text not null,
  scope text not null check (scope in ('day', 'week', 'month')),
  done boolean not null default false,
  created_at timestamptz not null,
  completed_at timestamptz,
  source_memo_id text references public.memos(id) on delete set null,
  due_date text,
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id text primary key,
  user_id text not null default 'default',
  label text not null default '',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.memos enable row level security;
alter table public.todos enable row level security;
alter table public.sessions enable row level security;

alter table public.memos add column if not exists user_id text not null default 'default';
alter table public.todos add column if not exists user_id text not null default 'default';
alter table public.memos add column if not exists starred boolean not null default false;
alter table public.todos add column if not exists due_date text;
alter table public.todos add column if not exists category text;
alter table public.todos add column if not exists note text;

create index if not exists memos_user_created_idx on public.memos (user_id, created_at desc);
create index if not exists todos_user_created_idx on public.todos (user_id, created_at desc);
create index if not exists todos_due_date_idx on public.todos (user_id, due_date);
create index if not exists sessions_user_started_idx on public.sessions (user_id, started_at desc);
```

서버가 시작할 때 `ensureSchema`로 같은 테이블을 자동 생성하므로, 기존 배포는 서버 업데이트만 해도 sessions 테이블이 만들어집니다.

`.env.example`을 참고해 `.env`를 만들고 실행합니다.

```bash
cp .env.example .env
export $(grep -v '^#' .env | xargs)
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

`DATABASE_URL`이 없으면 로컬 JSON 파일 저장소로 fallback 됩니다.

## 환경변수

```bash
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000,https://your-vercel-app.vercel.app
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
DATABASE_URL=postgresql://postgres.mkvgbffihswfjzgegwlx:YOUR-PASSWORD@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.mkvgbffihswfjzgegwlx:YOUR-PASSWORD@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

`DATABASE_URL`은 서버가 평소에 쓰는 연결입니다. Supabase가 보여준 shared transaction-mode pooler, 즉 `aws-1-ap-southeast-1.pooler.supabase.com:6543` 주소를 넣습니다.

`DIRECT_URL`은 Prisma/Drizzle 같은 migration 도구를 붙일 때 쓰는 session-mode 연결입니다. 현재 앱 런타임에서는 읽지 않습니다.

`ALLOWED_ORIGINS`는 OCI API를 호출할 수 있는 프론트엔드 origin 목록입니다. Vercel 배포 URL을 콤마로 추가합니다.

`SUPABASE_URL`과 `SUPABASE_ANON_KEY`는 Google 로그인 JWT 검증에 씁니다. 이 둘을 설정해야 API에 인증이 걸립니다 (안 하면 무인증으로 열림). Google 계정만 있으면 누구나 로그인해서 쓸 수 있고, 각자 데이터는 Supabase Auth user id 기준으로 자동 분리됩니다.

## Vercel FE 분리

Vercel에서 Project Root를 `client`로 설정합니다. 프론트엔드는 React + Vite + Tailwind + shadcn/ui이고,
`client/vercel.json`의 `buildCommand`/`outputDirectory` 설정으로 Vercel이 자동 빌드합니다.

로컬 개발은 `cd client && npm install && npm run dev`.

API/Supabase public 설정값은 `client/src/config.ts`에 있습니다.

API 주소는 첫 접속 때 `api` query로도 지정할 수 있고, 브라우저에 저장됩니다.

```text
https://your-vercel-app.vercel.app/?api=https://api.your-domain.com
```

Vercel은 HTTPS라서 OCI API도 HTTPS여야 합니다. `http://158.179.193.175:3000` 같은 HTTP API는 mixed content로 브라우저에서 막힐 수 있습니다. 도메인과 HTTPS를 붙인 뒤 `ALLOWED_ORIGINS`에 Vercel URL을 넣습니다.

## Google 로그인

Supabase Dashboard -> Authentication -> Providers -> Google에서 Google provider를 켭니다.

Google OAuth Authorized redirect URI:

```text
https://your-project-ref.supabase.co/auth/v1/callback
```

Authorized JavaScript origin:

```text
https://your-vercel-app.vercel.app
```

Google 로그인이 유일한 인증 수단입니다. Google provider를 켠 뒤 `client/src/config.js`와 서버 `.env`에 Supabase URL/anon key를 넣어야 실제로 인증이 걸립니다. 설정 전에는 API가 무인증으로 열려 있으니 프로덕션 배포 전에 꼭 켜야 합니다.

## 서버 CD

OCI 서버에서 최초 1회 systemd 서비스를 설치합니다.

```bash
cd ~/todo
git pull
npm ci --omit=dev
bash scripts/install-systemd.sh
```

이후 GitHub Actions가 `main` push 때 서버에 SSH로 접속해 `git reset --hard origin/main`, `npm ci --omit=dev`, `systemctl restart free-adhd-memo`를 실행합니다.

GitHub repo -> Settings -> Secrets and variables -> Actions에 아래 secrets를 추가합니다.

```text
OCI_HOST=158.179.193.175
OCI_USER=opc
OCI_SSH_KEY=서버에 접속 가능한 private key 전체 내용
OCI_APP_DIR=/home/opc/todo
```

서비스 로그 확인:

```bash
sudo journalctl -u free-adhd-memo -f
```

수동 재시작:

```bash
sudo systemctl restart free-adhd-memo
```

## 터미널 CLI

웹앱과 같은 API를 쓰는 터미널 클라이언트가 `cli/todo.js`에 있다.

설치 (Node.js 18+만 있으면 됨, 저장소 클론 불필요):

```bash
npm install -g https://todo-cohe.vercel.app/cli.tgz
```

업데이트도 같은 명령을 다시 실행하면 된다. 저장소를 클론해서 개발 중이라면 `npm link`가 더 편하다 (코드 수정이 바로 반영됨).

처음 한 번 Supabase Dashboard -> Authentication -> URL Configuration -> Redirect URLs에
`http://localhost:8787`을 추가해야 `todo login`(브라우저 Google 로그인)이 동작한다.

```bash
todo login             # 브라우저로 Google 로그인, 토큰은 ~/.config/free-adhd-memo/에 저장
todo                   # 할 일 목록
todo add "제목" -w     # 이번 주 할 일 추가 (-m 이번 달, -d 2026-07-20 마감일)
todo done 3            # 3번 완료 토글
todo memo "생각 #태그" # 메모 (- [ ] 줄은 할 일로 자동 추출)
todo track "코딩"      # 시간 기록 시작
todo stop              # 기록 종료 -> 타임테이블에 저장
todo log --week        # 이번 주 작업별 시간 합계
```

다른 서버를 쓰려면 `ADHD_API_BASE=http://localhost:3000` 환경변수로 바꾼다.

## 앱스토어 배포 (TWA)

이 앱은 PWA라서 Google Play에는 TWA(Trusted Web Activity)로 그대로 올릴 수 있다.

1. https://play.google.com/console 에서 개발자 계정 등록 ($25, 1회)
2. https://www.pwabuilder.com 에 `https://todo-cohe.vercel.app` 입력 -> Package for stores -> Android
   - package id는 `client/.well-known/assetlinks.json`의 `package_name`과 맞춘다
   - 생성된 `.aab`를 Play Console에 업로드 (signing key도 함께 생성해 주니 잘 보관)
3. Play Console -> Test and release -> App integrity -> App signing key certificate에서
   SHA-256 fingerprint를 복사해 `client/.well-known/assetlinks.json`에 넣고 배포
   - 이 파일이 맞아야 앱에서 브라우저 주소창이 사라진다
4. 스토어 등록정보(스크린샷, 설명, 개인정보처리방침 URL) 채우고 심사 제출

iOS App Store는 웹 래퍼 앱 심사 거절 위험이 크고 연 $99가 든다.
아이폰 사용자는 Safari -> 공유 -> 홈 화면에 추가로 안내하는 것을 권장.

## 빌드

```bash
npm run build
npm run preview
```
