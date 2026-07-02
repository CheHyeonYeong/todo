# Free ADHD Memo

`sonomemo`의 문맥 기록 아이디어를 웹앱으로 옮긴 todo + timestamp memo + pomodoro 앱입니다.

## 1차 배포 방향

- 추천: 가벼운 Node 서버 + Supabase Postgres
  - 구조는 Vercel 정적 FE -> OCI Node API -> Supabase DB입니다.
  - 클라이언트 코드는 `client/`, API 서버 코드는 `server/`에 분리되어 있습니다.
  - Oracle 1GB VPS에도 충분합니다.
  - `MEMO_TOKEN`을 설정하면 로그인 비밀번호가 생깁니다.
  - Supabase Google Auth를 설정하면 Google 로그인 JWT도 API에서 검증합니다.
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
- 뽀모도로 타이머
- 활동 그래프와 오늘의 집중 큐
- 폰/PC 간 서버 동기화
- memo/todo 항목 단위 저장으로 폰과 PC의 동시 사용 충돌 완화

## 개발

Supabase SQL Editor에서 먼저 실행합니다.

```sql
create table if not exists public.memo_state (
  id text primary key,
  data jsonb not null default '{"todos":[],"memos":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.memos (
  id text primary key,
  body text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.todos (
  id text primary key,
  title text not null,
  scope text not null check (scope in ('day', 'week', 'month')),
  done boolean not null default false,
  created_at timestamptz not null,
  completed_at timestamptz,
  source_memo_id text references public.memos(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.memo_state enable row level security;
alter table public.memos enable row level security;
alter table public.todos enable row level security;
```

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
MEMO_TOKEN=change-this-login-token
SESSION_SECRET=change-this-cookie-signing-secret
ALLOWED_ORIGINS=http://localhost:3000,https://your-vercel-app.vercel.app
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_ALLOWED_EMAILS=you@example.com
DATABASE_URL=postgresql://postgres.mkvgbffihswfjzgegwlx:YOUR-PASSWORD@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.mkvgbffihswfjzgegwlx:YOUR-PASSWORD@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
MEMO_TABLE=memo_state
MEMO_STATE_ID=default
```

`DATABASE_URL`은 서버가 평소에 쓰는 연결입니다. Supabase가 보여준 shared transaction-mode pooler, 즉 `aws-1-ap-southeast-1.pooler.supabase.com:6543` 주소를 넣습니다.

`DIRECT_URL`은 Prisma/Drizzle 같은 migration 도구를 붙일 때 쓰는 session-mode 연결입니다. 현재 앱 런타임에서는 읽지 않습니다.

`SESSION_SECRET`은 로그인 쿠키 서명용입니다. 아무 긴 랜덤 문자열로 두면 되고, 값을 바꾸면 기존 로그인 세션은 만료됩니다.

`ALLOWED_ORIGINS`는 OCI API를 호출할 수 있는 프론트엔드 origin 목록입니다. Vercel 배포 URL을 콤마로 추가합니다.

`SUPABASE_URL`과 `SUPABASE_ANON_KEY`는 Google 로그인 JWT 검증에 씁니다. `SUPABASE_ALLOWED_EMAILS`를 설정하면 지정한 Google 계정만 API를 사용할 수 있습니다.

## Vercel FE 분리

Vercel에서 Project Root를 `client`로 설정합니다. 프론트엔드는 정적 파일이라 빌드가 필요 없습니다.

`client/src/config.js`에 API와 Supabase public config를 넣습니다.

```js
window.FREE_ADHD_API_BASE_URL = "https://api.your-domain.com";
window.FREE_ADHD_SUPABASE_URL = "https://your-project-ref.supabase.co";
window.FREE_ADHD_SUPABASE_ANON_KEY = "your-public-anon-key";
```

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

Google provider를 켠 뒤 `client/src/config.js`와 서버 `.env`에 Supabase URL/anon key를 넣으면 로그인 화면에 Google 로그인 버튼이 표시됩니다.

## 빌드

```bash
npm run build
npm run preview
```
