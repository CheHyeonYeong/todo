# Todo Client

Expo 기반 React Native 클라이언트다. 기존 웹과 같은 API와 Supabase 계정을 사용한다.

## 실행

1. `.env.example`을 `.env`로 복사하고 값을 채운다.
2. Supabase Authentication의 허용 Redirect URL에 `todo://auth/callback`을 추가한다.
3. `npm install`
4. `npm run android` 또는 `npm run ios`

현재 클라이언트는 Todo와 하위 목표, 반복 루틴, 메모, 집중 타이머, 작업 시간 추적 및 날짜별 기록을 제공한다.
같은 Expo 코드로 Android, iOS, Web을 지원한다.
