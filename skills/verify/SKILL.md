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
npm run format:check
```

프론트엔드 리팩토링 PR을 검증할 때는 추가로 아래를 확인한다.

- 화면과 하위 컴포넌트가 전체 `useAppData` store를 그대로 props로 받지 않는지 확인한다.
- 각 기능 `domain/` 규칙이 화면 코드나 feature hook에 중복 인라인되지 않았는지 확인한다.
- feature 스타일 파일에 다른 도메인의 스타일이 섞이지 않았는지 확인한다.
- 합의 없는 CI, e2e, AGENTS.md 변경이 포함되지 않았는지 확인한다.
- 서버 DTO/id 계약을 클라이언트에서 임의로 바꾸지 않았는지 확인한다.

유용한 검색 예시는 다음과 같다.

```bash
rg -n "useAppData|store=|store\\." client/src
rg -n "new Date\\(\\)" client/src
rg -n "from .*domain" client/src
rg -n "uid\\(" client/src
```

## Rust CLI / TUI

```bash
cd tui
cargo test
```
