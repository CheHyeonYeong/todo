/* 단위 테스트 전용 설정. vite.config.ts와 분리해 프로덕션 빌드 경로는 건드리지 않는다. */
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
