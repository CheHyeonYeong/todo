# e2e 스모크 테스트

`tests/e2e.mjs`는 파일 모드 서버(`DATA_FILE` 임시 파일, 인증 없음)를 직접 띄우고
헤드리스 크로미움으로 웹앱의 주요 흐름을 검증한다.

## 준비

```bash
npm i                      # playwright-core 포함 (루트 devDependencies)
node node_modules/playwright-core/cli.js install chromium   # 크로미움 헤드리스 셸 내려받기
cd client && npm run build && cd ..   # dist가 있어야 서버가 화면을 서빙한다
```

크로미움 캐시 위치는 플랫폼마다 다르고(`~/.cache/ms-playwright`, macOS는 `~/Library/Caches/ms-playwright`,
Windows는 `%LOCALAPPDATA%\ms-playwright`) 번들 안의 실행 파일 경로도 다르다. `findChromium()`이 이를
플랫폼별로 해석하므로 따로 지정할 필요는 없다. `PLAYWRIGHT_BROWSERS_PATH`·`XDG_CACHE_HOME`도 존중한다.

## 실행

```bash
npm run e2e
```

- 실패한 항목은 `FAIL`로 표시되고 종료 코드 1로 끝난다.
- (WSL 전용) `libgbm.so.1`/`libwayland-server.so.0`이 없어 크로미움이 안 뜨면:
  `apt-get download libgbm1 libwayland-server0` 후 `dpkg-deb -x`로 풀고
  `LD_LIBRARY_PATH=<풀린 경로>/usr/lib/x86_64-linux-gnu npm run e2e`
- 환경변수: `E2E_PORT`(기본 34599), `E2E_CHROMIUM`(크로미움 실행 파일 경로 직접 지정)

## 검증하는 것

집중 큐 제거 / 스코프별 자동 마감일 / 수정 모드 카테고리 / 하위 목표 추가 /
지난 완료 숨김·펼치기 / 검색(할 일·메모) / 스코프 좌우 접기 / 삭제 되돌리기 /
vim 메모 편집·저장 / 다크 모드 / 뽀모도로 작업 입력 / 콘솔 오류 없음 /
모바일 폭 네비게이션 바(배지 점 표시, 좁은 폭에서 nav 내부 스크롤)
