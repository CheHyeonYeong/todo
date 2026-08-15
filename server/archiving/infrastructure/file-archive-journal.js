import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ArchiveJournal } from "../application/ports.js";

export class FileArchiveJournal extends ArchiveJournal {
  constructor(stateFile) { super(); this.stateFile = stateFile; }

  async lastRunMonth() {
    const value = await readFile(this.stateFile, "utf8").catch(() => "");
    return value.trim();
  }

  async recordRun(monthKey) {
    await mkdir(dirname(this.stateFile), { recursive: true });
    await writeFile(this.stateFile, `${monthKey}\n`, "utf8");
  }
}
