# Todo

Todo 관리용 API 서버, React Native 클라이언트, Rust CLI/TUI를 한 저장소에서 관리한다.

## 구조

- `client/`: Expo 기반 React Native 클라이언트
- `server/`: Node API 서버 (진입점 `server/server.js`, 바운디드 컨텍스트별 DDD 구조 — [ARCHITECTURE](server/ARCHITECTURE.md) · [CONTEXT-MAP](server/CONTEXT-MAP.md))
- `tui/`: Rust CLI 및 TUI
- `skills/`: AI 에이전트용 `todo-cli`, `verify` 스킬
- `scripts/`: 배포 및 CLI 설치 스크립트

## API 서버 실행

```bash
cp .env.example .env
npm install
npm run dev
```

`DATABASE_URL`이 없으면 로컬 JSON 파일 저장소를 사용한다. 인증과 Postgres 연결에 필요한 값은 `.env.example`을 참고한다.

## 클라이언트 실행

```bash
cd client
cp .env.example .env
npm install
npm run android
```

iOS에서는 `npm run ios`를 사용한다. Supabase Authentication의 허용 Redirect URL에 `todo://auth/callback`을 추가해야 한다.

## CLI / TUI

```bash
cd tui
cargo build --release
```

주요 명령:

```bash
todo login
todo list --json
todo add "할 일" -w
todo done 1
todo rm 1
todo undo
```

인자 없이 `todo`를 실행하면 대화형 TUI가 열린다.

## 배포

Expo Web은 Vercel에서 `client`를 Root Directory로 지정해 배포한다. `client/vercel.json`이 웹 빌드와 `dist` 출력 설정을 관리한다.

Vercel 프로젝트에는 `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` 환경변수를 설정한다.

API 서버는 Docker 또는 `.github/workflows/deploy-server.yml`을 통해 배포한다. 서버 서비스의 기본 이름은 `todo`다.

```bash
docker build -t todo .
docker run -p 3000:3000 --env-file .env todo
```
