#!/usr/bin/env node
// postinstall: 현재 플랫폼에 맞는 Rust `todo` 바이너리를 GitHub Release에서 받아 bin/에 넣는다.
// 릴리스가 없거나 네트워크가 막히면 cargo로 소스 빌드를 시도하고, 그것도 안 되면 안내만 남긴다.
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "CheHyeonYeong/todo";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const binDir = join(root, "bin");
const isWindows = process.platform === "win32";
const output = join(binDir, isWindows ? "todo.exe" : "todo");

const targets = {
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
};

const target = targets[`${process.platform}-${process.arch}`];

// 서버 배포(npm ci)나 레포 개발용 설치에서는 CLI 바이너리가 필요 없다. 전역 설치일 때만 받는다.
if (process.env.npm_config_global !== "true" && !process.env.TODO_FETCH_CLI) {
  process.exit(0);
}

async function download() {
  if (!target) return false;
  const url = `https://github.com/${REPO}/releases/latest/download/todo-${target}${isWindows ? ".exe" : ""}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) return false;
  mkdirSync(binDir, { recursive: true });
  writeFileSync(output, Buffer.from(await response.arrayBuffer()));
  if (!isWindows) chmodSync(output, 0o755);
  return true;
}

function buildFromSource() {
  const cargo = spawnSync("cargo", ["--version"], { stdio: "ignore" });
  if (cargo.status !== 0) return false;
  console.log("릴리스 바이너리를 받지 못해 cargo로 빌드합니다 (몇 분 걸립니다)…");
  const build = spawnSync("cargo", ["build", "--release"], {
    cwd: join(root, "tui"),
    stdio: "inherit",
  });
  if (build.status !== 0) return false;
  mkdirSync(binDir, { recursive: true });
  const built = join(root, "tui", "target", "release", isWindows ? "todo.exe" : "todo");
  if (!existsSync(built)) return false;
  copyFileSync(built, output);
  if (!isWindows) chmodSync(output, 0o755);
  return true;
}

try {
  if (await download()) {
    console.log("todo 바이너리 설치 완료.");
  } else if (buildFromSource()) {
    console.log("todo 바이너리 빌드 완료.");
  } else {
    console.warn(
      "todo 바이너리를 설치하지 못했습니다. Rust를 설치한 뒤 다시 시도하거나,\n" +
        "  cargo install --git https://github.com/CheHyeonYeong/todo todo\n" +
        "로 직접 설치하세요.",
    );
  }
} catch (error) {
  console.warn(`todo 바이너리 설치 실패: ${error.message}`);
}
