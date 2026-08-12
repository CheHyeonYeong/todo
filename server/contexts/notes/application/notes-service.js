import { Todo } from "../../planning/domain/todo.js";
import { Memo } from "../domain/memo.js";

/**
 * 노트 컨텍스트의 유스케이스.
 *
 * 컨텍스트 맵: 노트(고객) → 계획(공급자).
 * "메모를 적으면서 할 일을 함께 뽑는다"는 것이 이 앱의 실제 사용 언어라서,
 * 메모 저장과 할 일 생성은 반드시 같은 작업 단위 안에서 함께 성공하거나 함께 실패해야 한다.
 * 그래서 이 서비스만 예외적으로 계획 컨텍스트의 포트를 직접 쓴다.
 */
export class NotesService {
  constructor({ unitOfWork, memos, todos }) {
    this.unitOfWork = unitOfWork;
    this.memos = memos;
    this.todos = todos;
  }

  captureMemo(value, userId) {
    return this.unitOfWork.run(userId, async (tx) => {
      const memo = Memo.from(value?.memo).toJSON();
      const todos = Array.isArray(value?.todos) ? value.todos.map((item) => Todo.from(item).toJSON()) : [];
      await this.memos.capture(memo, tx);
      await this.todos.captureMany(todos, tx);
      return { memo, todos };
    });
  }

  updateMemo(id, patch, userId) {
    return this.unitOfWork.run(userId, (tx) => this.memos.update(id, patch, tx));
  }

  deleteMemo(id, userId) {
    return this.unitOfWork.run(userId, (tx) => this.memos.remove(id, tx));
  }

  reorderMemos(ids, userId) {
    const ordered = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean);
    return this.unitOfWork.run(userId, (tx) => this.memos.reorder(ordered, tx));
  }
}
