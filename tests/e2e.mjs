/* Expo 웹앱과 파일 모드 API를 함께 띄우는 최소 통합 스모크 테스트. */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.E2E_PORT || 34599);
const base = `http://127.0.0.1:${port}`;
const dataFile = path.join(os.tmpdir(), `todo-e2e-${Date.now()}.json`);

function findChromium() {
  if (process.env.E2E_CHROMIUM) return process.env.E2E_CHROMIUM;
  const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "ms-playwright");
  if (!existsSync(cache)) throw new Error("Playwright Chromium이 설치되지 않았습니다.");
  const versions = readdirSync(cache).sort().reverse();
  for (const version of versions) {
    const relative = version.startsWith("chromium_headless_shell-")
      ? ["chrome-headless-shell-win64", "chrome-headless-shell.exe"]
      : version.startsWith("chromium-")
        ? ["chrome-win", "chrome.exe"]
        : null;
    if (!relative) continue;
    const executable = path.join(cache, version, ...relative);
    if (existsSync(executable)) return executable;
  }
  throw new Error("Playwright Chromium 실행 파일을 찾지 못했습니다.");
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("테스트 서버가 시작되지 않았습니다.");
}

const expoCli = path.join(root, "client", "node_modules", "expo", "bin", "cli");
const build = spawnSync(process.execPath, [expoCli, "export", "--platform", "web", "--clear"], {
  cwd: path.join(root, "client"),
  env: {
    ...process.env,
    EXPO_PUBLIC_API_BASE_URL: base,
    EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
    EXPO_PUBLIC_E2E: "true",
  },
  stdio: "inherit",
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status || 1);

const server = spawn("node", [path.join(root, "server", "server.js")], {
  env: {
    ...process.env,
    PORT: String(port),
    DATA_FILE: dataFile,
    PUBLIC_DIR: path.join(root, "client", "dist"),
    SUPABASE_URL: "",
    DATABASE_URL: "",
  },
  stdio: "inherit",
});

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(base, { waitUntil: "networkidle" });

  const todoInput = page.getByPlaceholder("새 할 일");
  await todoInput.waitFor({ timeout: 10_000 }).catch(async (error) => {
    console.error("page text:", await page.locator("body").innerText());
    console.error("page errors:", pageErrors);
    throw error;
  });
  await todoInput.fill("통합 테스트 할 일");
  await page.getByText("추가", { exact: true }).first().click();
  await page.getByText("통합 테스트 할 일", { exact: true }).waitFor();

  await page.getByPlaceholder("제목", { exact: true }).fill("통합 테스트 메모");
  await page.getByPlaceholder("내용을 입력하세요").fill("본문 #검증");
  await page.getByText("메모 저장", { exact: true }).click();
  await page.getByText("통합 테스트 메모", { exact: true }).waitFor();

  const data = await (await fetch(`${base}/api/data`)).json();
  if (!data.todos.some((todo) => todo.title === "통합 테스트 할 일")) throw new Error("할 일이 API에 저장되지 않았습니다.");
  const memo = data.memos.find((item) => item.title === "통합 테스트 메모");
  if (!memo || memo.tags.join(",") !== "검증") throw new Error("메모와 파생 태그가 API에 저장되지 않았습니다.");
  if (pageErrors.length) throw new Error(`페이지 오류: ${pageErrors.join(" | ")}`);

  console.log("e2e smoke passed");
} finally {
  await browser?.close();
  server.kill();
  rmSync(dataFile, { force: true });
}
