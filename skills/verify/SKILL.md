---
name: verify
description: todo 프로젝트 변경사항을 API, Expo 클라이언트, Rust CLI 수준에서 검증한다.
---

# 검증

변경 범위에 따라 아래 검증을 실행한다.

## API 서버

```bash
PORT=34567 DATA_FILE=/tmp/store.json node server/server.js
curl http://localhost:34567/api/health
```

`SUPABASE_URL`과 `DATABASE_URL` 없이 실행하면 인증 없는 파일 저장 모드로 동작한다.

## Expo 클라이언트

```bash
cd client
npm run typecheck
```

## Rust CLI / TUI

```bash
cd tui
cargo test
```
