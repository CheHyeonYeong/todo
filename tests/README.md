# E2E 스모크 테스트

`npm run e2e`는 테스트 전용 Expo 웹 번들을 만든 뒤 파일 저장 모드 API와 Chromium을 띄운다.
할 일과 메모를 화면에서 생성하고 API 저장 결과 및 메모 태그 파생을 확인한다.

Chromium이 없다면 `npx playwright-core install chromium`으로 설치한다. 다른 실행 파일을 쓸 때는
`E2E_CHROMIUM`에 절대 경로를 지정한다.
