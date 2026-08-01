# Todo Client

Expo 기반 React Native 클라이언트다. 기존 웹과 같은 API와 Supabase 계정을 사용한다.

## 실행

1. `.env.example`을 `.env`로 복사하고 값을 채운다.
2. Supabase Authentication의 허용 Redirect URL에 `todo://auth/callback`을 추가한다.
3. `npm install`
4. `npm run android` 또는 `npm run ios`

현재 모바일 화면은 핵심 Todo 흐름(조회, 추가, 완료, 삭제)에 집중한다. 삭제는 항목을 길게 누르면 된다.
