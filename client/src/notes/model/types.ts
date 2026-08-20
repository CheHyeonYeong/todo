import type { MemoDto } from "../api/memoDto";

export interface Memo {
  id: string;
  title?: string;
  body: string;
  createdAt: string;
  tags: string[];
  starred?: boolean;
  sortOrder?: number;
}

export interface MemoDraft {
  title: string;
  body: string;
}

export function toMemo(dto: MemoDto): Memo {
  return { ...dto, tags: [...dto.tags] };
}
