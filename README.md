# Free ADHD Memo

`sonomemo`의 문맥 기록 아이디어를 웹앱으로 옮긴 todo + timestamp memo + pomodoro 앱입니다.

## 1차 배포 방향

- 추천: 가벼운 Node 서버 + Supabase Postgres
  - 구조는 브라우저 클라이언트 -> Node 서버 -> Supabase DB입니다.
  - Oracle 1GB VPS에도 충분합니다.
  - `MEMO_TOKEN`을 설정하면 로그인 비밀번호가 생깁니다.
  - 로그인 후에는 `HttpOnly` 쿠키로 세션을 유지합니다.
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

## 개발

Supabase SQL Editor에서 먼저 실행합니다.

```sql
create table if not exists public.memo_state (
  id text primary key,
  data jsonb not null default '{"todos":[],"memos":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.memo_state enable row level security;
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
DATABASE_URL=postgresql://postgres.mkvgbffihswfjzgegwlx:YOUR-PASSWORD@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.mkvgbffihswfjzgegwlx:YOUR-PASSWORD@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
MEMO_TABLE=memo_state
MEMO_STATE_ID=default
```

`DATABASE_URL`은 서버가 평소에 쓰는 연결입니다. Supabase가 보여준 shared transaction-mode pooler, 즉 `aws-1-ap-southeast-1.pooler.supabase.com:6543` 주소를 넣습니다.

`DIRECT_URL`은 Prisma/Drizzle 같은 migration 도구를 붙일 때 쓰는 session-mode 연결입니다. 현재 앱 런타임에서는 읽지 않습니다.

`SESSION_SECRET`은 로그인 쿠키 서명용입니다. 아무 긴 랜덤 문자열로 두면 되고, 값을 바꾸면 기존 로그인 세션은 만료됩니다.

## 빌드

```bash
npm run build
npm run preview
```
