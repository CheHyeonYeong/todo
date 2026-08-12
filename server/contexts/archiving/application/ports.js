/** 보관 컨텍스트가 요구하는 포트들. */

export class ArchiveRepository {
  /** 보관 대상이 있을 만한 사용자만 추린다. */
  candidateUserIds(_cutoffIso) { throw new Error("Not implemented"); }
  load(_userId) { throw new Error("Not implemented"); }
  purge(_ids, _userId) { throw new Error("Not implemented"); }
}

export class ArchiveMailer {
  send(_to, _report) { throw new Error("Not implemented"); }
}

export class UserDirectory {
  emailFor(_userId) { throw new Error("Not implemented"); }
}

/** 이번 달에 이미 보관을 돌렸는지 기억한다. 한 달에 한 번만 메일이 나가도록. */
export class ArchiveJournal {
  lastRunMonth() { throw new Error("Not implemented"); }
  recordRun(_monthKey) { throw new Error("Not implemented"); }
}
