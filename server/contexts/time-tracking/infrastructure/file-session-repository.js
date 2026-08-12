import { TimeSessionRepository } from "../application/ports.js";

export class FileTimeSessionRepository extends TimeSessionRepository {
  add(session, { snapshot }) {
    snapshot.sessions.unshift(session);
    return session;
  }

  remove(id, { snapshot }) {
    snapshot.sessions = snapshot.sessions.filter((session) => session.id !== id);
  }

  removeMany(ids, { snapshot }) {
    const removed = new Set(ids);
    snapshot.sessions = snapshot.sessions.filter((session) => !removed.has(session.id));
  }
}
