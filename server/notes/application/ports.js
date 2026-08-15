/** 노트 컨텍스트가 요구하는 저장소 포트. */
export class MemoRepository {
  capture(_memo, _tx) { throw new Error("Not implemented"); }
  update(_id, _patch, _tx) { throw new Error("Not implemented"); }
  remove(_id, _tx) { throw new Error("Not implemented"); }
  reorder(_ids, _tx) { throw new Error("Not implemented"); }
}
