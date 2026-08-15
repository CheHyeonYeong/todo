/**
 * 통합 컨텍스트가 요구하는 포트.
 * 개별 유스케이스가 아니라 "워크스페이스 전체"를 통째로 읽고 쓰는 경계라서
 * 다른 컨텍스트와 달리 작업 단위(tx)를 받지 않고 스스로 원자성을 책임진다.
 */
export class WorkspaceRepository {
  load(_userId) { throw new Error("Not implemented"); }
  replace(_value, _userId) { throw new Error("Not implemented"); }
  applyRoutineOccurrences(_snapshot, _changes, _userId) { throw new Error("Not implemented"); }
}
