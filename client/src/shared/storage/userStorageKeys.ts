export function workspaceCacheKey(userId: string): string {
  return `todo:${userId}:data-cache`;
}

export function activeSessionKey(userId: string): string {
  return `todo:${userId}:active-session`;
}
