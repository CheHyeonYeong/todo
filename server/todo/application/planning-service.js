import { Todo } from "../domain/todo.js";
import { TodoPlacement } from "../domain/todo-placement.js";

/**
 * 계획 컨텍스트의 유스케이스. 전송 수단(HTTP)도, 저장 기술도 모른다.
 * 하는 일은 셋뿐이다: 입력을 도메인 객체로 바꾸고, 작업 단위를 열고, 리포지토리에 맡긴다.
 */
export class PlanningService {
  constructor({ unitOfWork, todos }) {
    this.unitOfWork = unitOfWork;
    this.todos = todos;
  }

  createTodo(value, userId) {
    return this.unitOfWork.run(userId, (tx) => this.todos.add(Todo.from(value).toJSON(), tx));
  }

  updateTodo(id, patch, userId) {
    return this.unitOfWork.run(userId, (tx) => this.todos.update(id, patch, tx));
  }

  deleteTodo(id, userId) {
    return this.unitOfWork.run(userId, (tx) => this.todos.remove(id, tx));
  }

  reorderTodos(items, userId) {
    const placements = TodoPlacement.listFrom(items);
    return this.unitOfWork.run(userId, (tx) => this.todos.reorder(placements, tx));
  }
}
