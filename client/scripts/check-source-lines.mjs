import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceRoot = path.join(clientRoot, "src");
const limit = 200;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

const oversized = [path.join(clientRoot, "App.tsx"), ...sourceFiles(sourceRoot)]
  .map((file) => ({ file, lines: readFileSync(file, "utf8").trimEnd().split(/\r?\n/).length }))
  .filter(({ lines }) => lines > limit);

if (oversized.length) {
  for (const { file, lines } of oversized)
    console.error(`${path.relative(clientRoot, file)}: ${lines} lines`);
  console.error(`Frontend source files must not exceed ${limit} lines.`);
  process.exit(1);
}

console.log(`Frontend source files are within the ${limit}-line limit.`);
