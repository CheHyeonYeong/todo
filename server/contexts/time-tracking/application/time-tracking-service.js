import { TimeSession } from "../domain/time-session.js";

export class TimeTrackingService {
  constructor({ unitOfWork, sessions }) {
    this.unitOfWork = unitOfWork;
    this.sessions = sessions;
  }

  createSession(value, userId) {
    return this.unitOfWork.run(userId, (tx) => this.sessions.add(TimeSession.from(value).toJSON(), tx));
  }

  deleteSession(id, userId) {
    return this.unitOfWork.run(userId, (tx) => this.sessions.remove(id, tx));
  }
}
