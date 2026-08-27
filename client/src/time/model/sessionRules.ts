export function elapsedMinutes(startedAt: string, now: Date) {
  return Math.floor((now.getTime() - new Date(startedAt).getTime()) / 60000);
}

export function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}
