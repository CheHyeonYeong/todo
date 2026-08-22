import type { MemoDto } from "../api/memoDto";

export interface Memo {
  id: string;
  title?: string;
  body: string;
  createdAt: string;
  tags: string[];
}

export function toMemo(dto: MemoDto): Memo {
  return {
    id: dto.id,
    title: dto.title,
    body: dto.body,
    createdAt: dto.createdAt,
    tags: [...dto.tags],
  };
}
