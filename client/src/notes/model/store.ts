import type { Memo } from "./types";

export interface MemoStore {
  data: { memos: Memo[] };
  addMemo(title: string, body: string): Promise<void>;
  patchMemo(id: string, patch: Partial<Memo>): Promise<void>;
  deleteMemo(id: string): Promise<void>;
}
