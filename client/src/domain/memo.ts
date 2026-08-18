/* 메모 본문에서 파생되는 값. 저장할 때마다 본문에서 다시 계산한다. */

/**
 * 본문의 #태그. 공백과 #을 제외한 나머지를 전부 태그로 본다.
 * 그래서 "#작업, 정리"의 태그는 쉼표까지 포함한 "작업," 이다 — 현재 동작을 그대로 옮겼다.
 */
export function extractTags(body: string): string[] {
  return [...body.matchAll(/#([^\s#]+)/g)].map((match) => match[1]);
}

/** "- [ ] 할 일" 또는 "todo: 할 일" 형태의 줄만 할 일로 뽑는다. 완료 표시된 줄은 제외된다. */
export function extractTodoTitles(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.match(/^\s*(?:-\s*\[\s?\]|todo:)\s*(.+)$/i)?.[1]?.trim())
    .filter((title): title is string => Boolean(title));
}
