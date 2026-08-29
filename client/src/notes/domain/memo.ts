/* 메모 본문에서 파생되는 값. 저장할 때마다 본문에서 다시 계산한다. */
import type { Memo } from "../../types";

/**
 * 본문의 #태그. 문자·숫자·밑줄·하이픈까지만 태그로 보고 구두점에서 끊는다.
 * \p{L}이라 한글·일본어처럼 라틴이 아닌 글자도 그대로 태그가 된다.
 */
export function extractTags(body: string): string[] {
  return [...body.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((match) => match[1]);
}

/**
 * 본문이 바뀐 패치에는 태그를 다시 붙인다.
 * 태그는 본문에서 파생되는 값이라, 본문만 저장하면 옛 태그가 그대로 남는다.
 */
export function withDerivedTags(patch: Partial<Memo>): Partial<Memo> {
  if (patch.body === undefined) return patch;
  return { ...patch, tags: extractTags(patch.body) };
}

/** "- [ ] 할 일" 또는 "todo: 할 일" 형태의 줄만 할 일로 뽑는다. 완료 표시된 줄은 제외된다. */
export function extractTodoTitles(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.match(/^\s*(?:-\s*\[\s?\]|todo:)\s*(.+)$/i)?.[1]?.trim())
    .filter((title): title is string => Boolean(title));
}
