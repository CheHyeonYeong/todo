---
name: verify
description: 이 레포(todo 앱)의 변경을 실제로 구동해 확인하는 레시피 — 빌드, 파일 모드 서버 기동, 헤드리스 브라우저 드라이브
---

# 검증 레시피

## 빌드 & 서버 기동 (파일 저장 모드, 인증 비활성)

```bash
cd client && npm run build          # dist 생성 (~1분)
PORT=34567 DATA_FILE=/tmp/store.json node server/server.js
# SUPABASE_URL/DATABASE_URL 없이 띄우면 인증 없이 파일 모드로 동작, client/dist를 정적 서빙
```

API 스모크: `curl http://localhost:34567/api/health`, `/api/data` (GET/PUT), `/api/todos`, `/api/memos`.

## 헤드리스 브라우저 드라이브

- 클라이언트 API 베이스는 기본이 프로덕션 URL. **`http://localhost:34567/?api=http://localhost:34567`** 로 열면 로컬 서버를 보게 됨 (localStorage에 저장됨).
- Playwright: 스크래치패드에 `npm i playwright-core` 후 캐시된 크로미움 사용.
  - 이 WSL 환경엔 `libgbm.so.1`, `libwayland-server.so.0`이 없음 → `apt-get download libgbm1 libwayland-server0` + `dpkg-deb -x`로 풀고 `LD_LIBRARY_PATH`로 주입하면 실행됨.
  - executablePath: `~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell`
- 헤드리스에 한글 폰트가 없어 글자가 □로 보이지만 레이아웃 검증에는 지장 없음.

## 주의

- 메모/투두 드래그앤드롭은 HTML5 DnD — Playwright `locator.dragTo()`로 동작함.
- 페이지 폼이 여러 개(투두 추가, 메모 작성, 메모 편집). `form` nth 인덱스로 잡지 말고 내용물(버튼 텍스트 등)로 filter 할 것.
- 파일 모드 서버는 요청 로그가 없음 — 드라이브 스크립트에서 `page.on("response")`로 API 상태코드를 찍는 게 빠름.
