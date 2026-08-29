/* 도메인 순수함수 전용 테스트 설정.
   src/domain은 react-native를 import하지 않으므로 node 환경에서 그대로 돈다. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/domain/**/*.test.ts"],
  },
});
