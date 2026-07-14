#!/usr/bin/env node
// npm으로 설치된 Rust `todo` 바이너리를 실행한다.
// 바이너리는 postinstall(scripts/fetch-cli-binary.js)이 GitHub Release에서 받아 bin/에 넣는다.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const binary = join(root, "bin", process.platform === "win32" ? "todo.exe" : "todo");

if (!existsSync(binary)) {
  console.error(
    "todo 바이너리가 없습니다. 설치가 덜 끝났을 수 있습니다.\n" +
      "다시 설치하거나, Rust가 있다면 소스에서 빌드하세요:\n" +
      "  npm install -g https://todo-cohe.vercel.app/cli.tgz\n" +
      "  (또는) cargo install --git https://github.com/CheHyeonYeong/todo todo",
  );
  process.exit(1);
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" });
process.exit(result.status === null ? 1 : result.status);
