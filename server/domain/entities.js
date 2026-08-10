const SCOPES = new Set(["day", "week", "month"]);

export class Todo {
  constructor(value = {}, now = () => new Date()) {
    this.id = String(value.id || "");
    this.title = String(value.title || "").trim();
    this.scope = SCOPES.has(value.scope) ? value.scope : "day";
    this.done = Boolean(value.done);
    this.createdAt = value.createdAt || now().toISOString();
    this.completedAt = value.completedAt || null;
    this.sourceMemoId = value.sourceMemoId || null;
    this.dueDate = /^\d{4}-\d{2}-\d{2}$/.test(value.dueDate) ? value.dueDate : null;
    this.category = optionalText(value.category);
    this.note = optionalText(value.note);
    this.parentId = typeof value.parentId === "string" && value.parentId ? value.parentId : null;
    this.routineId = typeof value.routineId === "string" && value.routineId ? value.routineId : null;
    this.sortOrder = finiteNumber(value.sortOrder);
  }

  complete(at = new Date()) {
    this.done = true;
    this.completedAt = at.toISOString();
    return this;
  }

  reopen() {
    this.done = false;
    this.completedAt = null;
    return this;
  }

  toJSON() { return { ...this }; }
  static from(value, now) { return new Todo(value, now); }
}

export class Memo {
  constructor(value = {}, now = () => new Date()) {
    this.id = String(value.id || "");
    this.title = String(value.title || "").trim();
    this.body = String(value.body || "").trim();
    this.createdAt = value.createdAt || now().toISOString();
    this.tags = Array.isArray(value.tags) ? value.tags.map(String) : [];
    this.starred = Boolean(value.starred);
    this.sortOrder = finiteNumber(value.sortOrder);
  }
  toJSON() { return { ...this }; }
  static from(value, now) { return new Memo(value, now); }
}

export class TimeSession {
  constructor(value = {}, now = () => new Date()) {
    const timestamp = now().toISOString();
    this.id = String(value.id || "");
    this.label = String(value.label || "").trim();
    this.startedAt = value.startedAt || timestamp;
    this.endedAt = value.endedAt || timestamp;
  }
  toJSON() { return { ...this }; }
  static from(value, now) { return new TimeSession(value, now); }
}

export class Routine {
  constructor(value = {}, now = () => new Date()) {
    this.id = String(value.id || "");
    this.title = String(value.title || "").trim();
    this.weekdays = Array.isArray(value.weekdays)
      ? [...new Set(value.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
      : [];
    this.category = optionalText(value.category);
    this.active = value.active === undefined ? true : Boolean(value.active);
    this.createdAt = value.createdAt || now().toISOString();
  }
  occursOn(weekday) { return this.active && this.weekdays.includes(weekday); }
  toJSON() { return { ...this }; }
  static from(value, now) { return new Routine(value, now); }
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
}
