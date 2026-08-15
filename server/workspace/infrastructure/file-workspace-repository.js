import { WorkspaceRepository } from "../application/ports.js";

/** 파일 모드에서는 워크스페이스 하나가 곧 파일 하나다. */
export class FileWorkspaceRepository extends WorkspaceRepository {
  constructor(store) { super(); this.store = store; }

  load(userId) { return this.store.read(userId); }
  replace(value, userId) { return this.store.write(value, userId); }
  applyRoutineOccurrences(snapshot, _changes, userId) { return this.store.write(snapshot, userId); }
}
