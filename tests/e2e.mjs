/* 웹앱 e2e 스모크: 파일 모드 서버를 직접 띄우고 헤드리스 크로미움으로 주요 흐름을 확인한다.
   실행: npm run e2e  (playwright-core와 크로미움 헤드리스 셸이 필요 — tests/README.md 참고) */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.E2E_PORT || 34599);
const BASE = `http://localhost:${PORT}`;

function findChromium() {
  if (process.env.E2E_CHROMIUM) return process.env.E2E_CHROMIUM;
  const cache = path.join(os.homedir(), ".cache/ms-playwright");
  const shell = fs
    .readdirSync(cache)
    .filter((dir) => dir.startsWith("chromium_headless_shell"))
    .sort()
    .pop();
  if (!shell) throw new Error("chromium_headless_shell이 없습니다. npx playwright install chromium 후 다시 시도하세요.");
  return path.join(cache, shell, "chrome-headless-shell-linux64/chrome-headless-shell");
}

let failures = 0;
function check(name, condition, detail = "") {
  const mark = condition ? "ok" : "FAIL";
  if (!condition) failures += 1;
  console.log(`${mark.padEnd(4)} ${name}${!condition && detail ? ` — ${detail}` : ""}`);
}

async function api(pathname, options) {
  const response = await fetch(`${BASE}${pathname}`, options);
  if (!response.ok) throw new Error(`${pathname} -> ${response.status}`);
  return response.json();
}

const dataFile = path.join(os.tmpdir(), `todo-e2e-${Date.now()}.json`);
const server = spawn("node", [path.join(root, "server/server.js")], {
  env: { ...process.env, PORT: String(PORT), DATA_FILE: dataFile },
  stdio: "ignore",
});

try {
  // 서버가 뜰 때까지 대기
  for (let attempt = 0; ; attempt += 1) {
    try {
      await api("/api/health");
      break;
    } catch {
      if (attempt > 40) throw new Error("서버가 뜨지 않습니다");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  // 어제 완료한 할 일을 미리 심어 "지난 완료 숨김"을 검증한다
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  await api("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "seed-old", title: "어제 끝낸 일", scope: "day", done: true, createdAt: yesterday, completedAt: yesterday }),
  });

  const browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${BASE}/?api=${BASE}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  // 1) 집중 큐가 없어야 한다
  check("집중 큐 제거됨", (await page.getByText("집중 큐").count()) === 0);

  // 2) 스코프 선택 시 마감일 자동 설정 (이번 주 → 일요일, 이번 달 → 말일)
  const dateInput = page.locator('input[type="date"]').first();
  await page.locator('button[role="combobox"]').first().click();
  await page.getByRole("option", { name: "이번 주" }).click();
  const weekDue = new Date(`${await dateInput.inputValue()}T00:00:00`);
  check("이번 주 마감일 = 일요일", weekDue.getDay() === 0, await dateInput.inputValue());
  await page.locator('button[role="combobox"]').first().click();
  await page.getByRole("option", { name: "이번 달" }).click();
  const monthDueKey = await dateInput.inputValue();
  const monthDue = new Date(`${monthDueKey}T00:00:00`);
  check("이번 달 마감일 = 말일", new Date(monthDue.getFullYear(), monthDue.getMonth() + 1, 0).getDate() === monthDue.getDate(), monthDueKey);
  await page.locator('button[role="combobox"]').first().click();
  await page.getByRole("option", { name: "오늘" }).click();

  // 3) 할 일 추가 + 수정 모드에서 카테고리 달기
  await page.getByPlaceholder("할 일 추가").fill("이커머스 기획");
  await page.getByPlaceholder("할 일 추가").press("Enter");
  await page.waitForTimeout(300);
  const row = page.locator(".group", { hasText: "이커머스 기획" }).first();
  await row.hover();
  await row.getByTitle("수정").click();
  await page.getByPlaceholder("카테고리", { exact: true }).fill("업무");
  await page.getByPlaceholder("카테고리", { exact: true }).press("Enter");
  await page.waitForTimeout(400);
  let data = await api("/api/data");
  check("수정으로 카테고리 추가", data.todos.find((todo) => todo.title === "이커머스 기획")?.category === "업무");

  // 4) 하위 목표 추가
  await row.hover();
  await row.getByTitle("하위 목표 추가").click();
  await page.getByPlaceholder("하위 목표 (Enter로 추가, Esc로 닫기)").fill("시안 검토");
  await page.getByPlaceholder("하위 목표 (Enter로 추가, Esc로 닫기)").press("Enter");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  data = await api("/api/data");
  const parent = data.todos.find((todo) => todo.title === "이커머스 기획");
  check("하위 목표 생성", data.todos.some((todo) => todo.title === "시안 검토" && todo.parentId === parent?.id));

  // 5) 지난 완료 숨김 + 보기 토글
  check("어제 완료 항목 숨김", (await page.getByText("어제 끝낸 일").count()) === 0);
  await page.getByText("지난 완료 1개 보기").click();
  check("지난 완료 펼치기", (await page.getByText("어제 끝낸 일").count()) === 1);
  await page.getByText("지난 완료 숨기기").first().click();

  // 6) 검색: 제목으로 거르기
  await page.getByPlaceholder("검색", { exact: true }).fill("이커머스");
  await page.waitForTimeout(200);
  check("검색 결과 노출", (await page.getByText("이커머스 기획").count()) >= 1);
  check("검색에서 다른 항목 제외", (await page.getByText("어제 끝낸 일").count()) === 0);
  await page.getByPlaceholder("검색", { exact: true }).fill("");

  // 7) 좌우 접기: 접힌 칸은 세로 띠(폭 ~44px)
  const sections = page.locator("div.rounded-lg.bg-muted").filter({ has: page.locator("h3") });
  await page.getByTitle("접기").first().click();
  await page.waitForTimeout(300);
  const collapsedBox = await sections.nth(0).boundingBox();
  check("스코프 좌우 접힘", collapsedBox && collapsedBox.width < 60, `width=${collapsedBox?.width}`);
  await page.getByTitle("펼치기").first().click();

  // 8) 삭제 + 되돌리기 토스트
  const subRow = page.locator(".group", { hasText: "시안 검토" }).last();
  await subRow.hover();
  await subRow.getByTitle("삭제").click();
  await page.waitForTimeout(300);
  check("되돌리기 토스트 표시", await page.getByRole("button", { name: "되돌리기" }).isVisible());
  await page.getByRole("button", { name: "되돌리기" }).click();
  await page.waitForTimeout(400);
  data = await api("/api/data");
  check("삭제 되돌리기 복원", data.todos.some((todo) => todo.title === "시안 검토"));

  // 9) 메모: vim 토글 + 기본 vim 편집 + Ctrl+Enter 저장
  await page.getByRole("button", { name: "vim" }).click();
  const cm = page.locator(".cm-content").first();
  await cm.waitFor({ timeout: 5000 });
  await cm.click();
  await page.keyboard.type("ivim 테스트 메모");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Enter");
  await page.waitForTimeout(400);
  data = await api("/api/data");
  check("vim 메모 저장", data.memos.some((memo) => memo.body.includes("vim 테스트 메모")));
  await page.getByRole("button", { name: "vim" }).click(); // 원상복구

  // 10) 메모 검색
  await page.getByPlaceholder("메모 검색 (제목·본문·#태그)").fill("없는키워드zzz");
  await page.waitForTimeout(200);
  check("메모 검색 빈 결과", (await page.getByText("검색 결과가 없습니다.").count()) === 1);
  await page.getByPlaceholder("메모 검색 (제목·본문·#태그)").fill("");

  // 11) 다크 모드 토글
  await page.getByTitle("다크 모드").click();
  check("다크 모드 적용", await page.evaluate(() => document.documentElement.classList.contains("dark")));
  await page.getByTitle("라이트 모드").click();
  check("라이트 모드 복귀", await page.evaluate(() => !document.documentElement.classList.contains("dark")));

  // 12) 뽀모도로: 현재 작업 입력과 사이클 점 표시
  check("뽀모도로 작업 입력", await page.getByPlaceholder("지금 뭘 하는 중? (집중 기록 이름)").isVisible());

  check("페이지 오류 없음", pageErrors.length === 0, pageErrors.join(" | "));

  await browser.close();
} finally {
  server.kill();
  fs.rmSync(dataFile, { force: true });
}

console.log(failures ? `\n${failures}개 실패` : "\n전부 통과");
process.exit(failures ? 1 : 0);
