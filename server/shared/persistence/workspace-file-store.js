import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { WorkspaceSnapshot } from "../../workspace/domain/workspace-snapshot.js";

/**
 * 파일 모드에서는 모든 컨텍스트가 store.json 하나를 나눠 쓴다.
 * 기술적 저장소일 뿐이며, 어떤 값이 유효한지는 WorkspaceSnapshot(도메인)이 정한다.
 */
export class WorkspaceFileStore {
  constructor(dataFile) { this.dataFile = dataFile; }

  static empty() { return { todos: [], memos: [], sessions: [], routines: [] }; }

  async read() {
    try {
      const raw = await readFile(this.dataFile, "utf8");
      return WorkspaceSnapshot.from(JSON.parse(raw)).toJSON();
    } catch (error) {
      if (error.code === "ENOENT") return WorkspaceFileStore.empty();
      throw error;
    }
  }

  async write(value) {
    const data = WorkspaceSnapshot.from(value).toJSON();
    const tempFile = `${this.dataFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    await mkdir(dirname(this.dataFile), { recursive: true });
    await writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tempFile, this.dataFile);
    return data;
  }
}
