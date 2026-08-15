/**
 * 계획 컨텍스트가 바깥세상에 요구하는 것(포트).
 * 애플리케이션 계층은 이 인터페이스만 알고, Postgres인지 파일인지는 모른다.
 * 모든 메서드는 진행 중인 작업 단위(tx)를 마지막 인자로 받는다.
 */
export class TodoRepository {
  add(_todo, _tx) { throw new Error("Not implemented"); }
  update(_id, _patch, _tx) { throw new Error("Not implemented"); }
  remove(_id, _tx) { throw new Error("Not implemented"); }
  removeMany(_ids, _tx) { throw new Error("Not implemented"); }
  reorder(_placements, _tx) { throw new Error("Not implemented"); }
  /** 메모에서 뽑아낸 할 일 (노트 컨텍스트와 같은 트랜잭션에서 저장된다) */
  captureMany(_todos, _tx) { throw new Error("Not implemented"); }
  /** 루틴이 만든 오늘의 발생 */
  appendOccurrences(_todos, _tx) { throw new Error("Not implemented"); }
  /** 루틴이 삭제될 때 이미 만들어진 할 일에서 연결만 끊는다 */
  detachRoutine(_routineId, _tx) { throw new Error("Not implemented"); }
}
