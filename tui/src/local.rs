//! 낙관적 업데이트: 서버 응답을 기다리지 않고 로컬 트리에 먼저 반영한다.
//! 여기 규칙은 server/server.js의 createTodo/updateTodo/deleteTodoById/reorderTodos와 같아야 한다.
//! (어긋나면 다음 새로고침 때 서버 상태로 덮어써지므로 치명적이진 않지만 화면이 한 번 튄다.)
use crate::model::{ordered_siblings, OrderItem, Todo};
use crate::util::now_iso;
use serde_json::Value;

/// 부모의 완료 상태를 자식들로부터 다시 계산한다. 자식이 없으면 건드리지 않는다.
fn recompute_parents(todos: &mut Vec<Todo>) {
    let parent_state: Vec<(String, bool)> = todos
        .iter()
        .filter(|todo| todo.parent_id.is_none())
        .filter_map(|parent| {
            let children: Vec<&Todo> = todos
                .iter()
                .filter(|child| child.parent_id.as_deref() == Some(parent.id.as_str()))
                .collect();
            (!children.is_empty()).then(|| (parent.id.clone(), children.iter().all(|child| child.done)))
        })
        .collect();
    for (id, done) in parent_state {
        if let Some(parent) = todos.iter_mut().find(|todo| todo.id == id) {
            parent.done = done;
            parent.completed_at = if done {
                parent.completed_at.clone().or_else(|| Some(now_iso()))
            } else {
                None
            };
        }
    }
}

pub fn next_sort_order(todos: &[Todo], scope: &str, parent: Option<&str>) -> f64 {
    ordered_siblings(todos, scope, parent)
        .iter()
        .filter_map(|todo| todo.sort_order)
        .fold(-1.0_f64, f64::max)
        + 1.0
}

pub fn create(todos: &mut Vec<Todo>, todo: Todo) {
    todos.push(todo);
    recompute_parents(todos);
}

pub fn patch(todos: &mut Vec<Todo>, id: &str, patch: &Value) {
    let Some(index) = todos.iter().position(|todo| todo.id == id) else {
        return;
    };
    let is_root = todos[index].parent_id.is_none();

    if let Some(title) = patch.get("title").and_then(Value::as_str) {
        if !title.trim().is_empty() {
            todos[index].title = title.trim().to_string();
        }
    }
    if let Some(due) = patch.get("dueDate") {
        todos[index].due_date = due.as_str().filter(|due| !due.is_empty()).map(str::to_string);
    }
    if let Some(category) = patch.get("category") {
        todos[index].category = category
            .as_str()
            .map(str::trim)
            .filter(|category| !category.is_empty())
            .map(str::to_string);
    }
    if let Some(note) = patch.get("note") {
        todos[index].note = note.as_str().filter(|note| !note.is_empty()).map(str::to_string);
    }
    if let Some(scope) = patch.get("scope").and_then(Value::as_str) {
        todos[index].scope = scope.to_string();
        if is_root {
            let parent_id = todos[index].id.clone();
            let scope = scope.to_string();
            for child in todos.iter_mut().filter(|todo| todo.parent_id.as_deref() == Some(&parent_id)) {
                child.scope = scope.clone();
            }
        }
    }
    if let Some(done) = patch.get("done").and_then(Value::as_bool) {
        let completed_at = patch
            .get("completedAt")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| done.then(now_iso));
        todos[index].done = done;
        todos[index].completed_at = if done { completed_at.clone() } else { None };
        if is_root {
            // 부모 완료는 자식 전체로 전파된다.
            let parent_id = todos[index].id.clone();
            for child in todos.iter_mut().filter(|todo| todo.parent_id.as_deref() == Some(&parent_id)) {
                child.done = done;
                child.completed_at = if done { completed_at.clone() } else { None };
            }
        } else {
            recompute_parents(todos);
        }
    }
}

pub fn delete(todos: &mut Vec<Todo>, id: &str) -> Vec<Todo> {
    let removed: Vec<Todo> = todos
        .iter()
        .filter(|todo| todo.id == id || todo.parent_id.as_deref() == Some(id))
        .cloned()
        .collect();
    todos.retain(|todo| todo.id != id && todo.parent_id.as_deref() != Some(id));
    recompute_parents(todos);
    removed
}

pub fn restore(todos: &mut Vec<Todo>, restored: &[Todo]) {
    for todo in restored {
        if !todos.iter().any(|existing| existing.id == todo.id) {
            todos.push(todo.clone());
        }
    }
    recompute_parents(todos);
}

pub fn reorder(todos: &mut Vec<Todo>, items: &[OrderItem]) {
    for item in items {
        if let Some(todo) = todos.iter_mut().find(|todo| todo.id == item.id) {
            todo.parent_id = item.parent_id.clone();
            todo.sort_order = Some(item.sort_order);
            todo.scope = item.scope.clone();
        }
    }
    recompute_parents(todos);
}
