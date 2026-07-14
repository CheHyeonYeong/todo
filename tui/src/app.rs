use crate::api::Client;
use crate::local;
use crate::model::{
    category_list, extract_tags, normalized_items, ordered_siblings, valid_date, visible_tree, OrderItem,
    Routine, Row, Session, Todo,
};
use crate::sync::{Event as SyncEvent, Job, Sync};
use crate::ui;
use crate::util::{new_uuid, now_iso, split_due_suffix, split_weekdays, today_key};
use ratatui::crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq)]
pub enum Mode {
    Insert,
    Normal,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PromptKind {
    Child,
    Edit,
    Due,
    Category,
    /// 빠른 메모 (m)
    Memo,
    /// 루틴 추가 (R 오버레이에서 n). "제목 월수금" 처럼 요일을 뒤에 붙인다.
    Routine,
}

pub struct Editor {
    pub chars: Vec<char>,
    pub cursor: usize,
}

impl Editor {
    pub fn new(value: &str) -> Self {
        let chars: Vec<char> = value.chars().collect();
        Editor { cursor: chars.len(), chars }
    }

    pub fn value(&self) -> String {
        self.chars.iter().collect()
    }

    fn prev_word(&self) -> usize {
        let mut index = self.cursor;
        while index > 0 && self.chars[index - 1].is_whitespace() {
            index -= 1;
        }
        while index > 0 && !self.chars[index - 1].is_whitespace() {
            index -= 1;
        }
        index
    }

    pub fn handle(&mut self, key: &KeyEvent) -> bool {
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
        match (key.code, ctrl) {
            (KeyCode::Left, false) => self.cursor = self.cursor.saturating_sub(1),
            (KeyCode::Right, false) => self.cursor = (self.cursor + 1).min(self.chars.len()),
            (KeyCode::Home, _) | (KeyCode::Char('a'), true) => self.cursor = 0,
            (KeyCode::End, _) | (KeyCode::Char('e'), true) => self.cursor = self.chars.len(),
            (KeyCode::Backspace, _) => {
                if self.cursor > 0 {
                    self.chars.remove(self.cursor - 1);
                    self.cursor -= 1;
                }
            }
            (KeyCode::Delete, _) => {
                if self.cursor < self.chars.len() {
                    self.chars.remove(self.cursor);
                }
            }
            (KeyCode::Char('w'), true) => {
                let start = self.prev_word();
                self.chars.drain(start..self.cursor);
                self.cursor = start;
            }
            (KeyCode::Char('u'), true) => {
                self.chars.drain(..self.cursor);
                self.cursor = 0;
            }
            (KeyCode::Char('k'), true) => {
                self.chars.truncate(self.cursor);
            }
            (KeyCode::Char(ch), false) => {
                self.chars.insert(self.cursor, ch);
                self.cursor += 1;
            }
            _ => return false,
        }
        true
    }
}

pub struct Prompt {
    pub kind: PromptKind,
    pub label: String,
    pub editor: Editor,
    pub todo_id: String,
}

/// 하나의 변경. 로컬에 즉시 반영하고 같은 내용을 백그라운드로 서버에 보낸다.
/// perform()이 역연산을 돌려주므로 undo 스택에는 그것만 쌓으면 된다.
pub enum Op {
    Create(Todo),
    Patch(String, Value),
    Delete(String),
    Restore(Vec<Todo>),
    Reorder(Vec<OrderItem>),
}

pub struct UndoEntry {
    pub label: String,
    pub op: Op,
}

/// 평소에는 목록만 보이고, 이것들은 키를 눌렀을 때만 위에 뜬다.
#[derive(Debug, Clone, PartialEq)]
pub enum Overlay {
    None,
    Help,
    Pomodoro,
    Timetable,
    Routines,
}

/// 뽀모도로. 서버와 무관하게 로컬에서 돌고, 1분 이상 집중하면 타임테이블에 기록한다.
pub struct Timer {
    pub minutes: i64,
    pub end_at: Option<Instant>,
    pub started_at: Option<String>,
}

impl Timer {
    pub fn remaining(&self) -> Option<Duration> {
        self.end_at.map(|end| end.saturating_duration_since(Instant::now()))
    }

    pub fn label(&self) -> String {
        let seconds = self
            .remaining()
            .map(|left| left.as_secs())
            .unwrap_or((self.minutes * 60) as u64);
        format!("{:02}:{:02}", seconds / 60, seconds % 60)
    }
}

pub struct App {
    pub sync: Sync,
    pub todos: Vec<Todo>,
    pub sessions: Vec<Session>,
    pub routines: Vec<Routine>,
    pub overlay: Overlay,
    pub timer: Timer,
    /// 루틴 오버레이의 선택 위치
    pub routine_selected: usize,
    pub mode: Mode,
    pub input: Editor,
    pub prompt: Option<Prompt>,
    pub selected: usize,
    pub selected_id: Option<String>,
    pub collapsed: HashSet<String>,
    pub category: Option<String>,
    pub undo_stack: Vec<UndoEntry>,
    pub message: String,
    pub quit: bool,
    /// 순서 이동은 연타되기 쉬워서 이 시각까지 모았다가 한 번만 보낸다.
    reorder_due: Option<Instant>,
    /// 새로고침 요청이 이미 워커에 가 있는지 (중복 요청 방지)
    refresh_pending: bool,
}

const REORDER_DEBOUNCE: Duration = Duration::from_millis(300);

impl App {
    fn new(sync: Sync, data: crate::model::Data) -> Self {
        let mut app = App {
            sync,
            todos: data.todos,
            sessions: data.sessions,
            routines: data.routines,
            overlay: Overlay::None,
            timer: Timer { minutes: 25, end_at: None, started_at: None },
            routine_selected: 0,
            mode: Mode::Insert,
            input: Editor::new(""),
            prompt: None,
            selected: 0,
            selected_id: None,
            collapsed: HashSet::new(),
            category: None,
            undo_stack: Vec::new(),
            message: String::new(),
            quit: false,
            reorder_due: None,
            refresh_pending: false,
        };
        app.sync_selection(None);
        app
    }

    pub fn rows(&self) -> Vec<Row> {
        visible_tree(&self.todos, &self.collapsed, self.category.as_deref())
    }

    pub fn categories(&self) -> Vec<String> {
        category_list(&self.todos)
    }

    fn sync_selection(&mut self, preferred: Option<String>) {
        let rows = self.rows();
        if rows.is_empty() {
            self.selected = 0;
            self.selected_id = None;
            return;
        }
        let preferred = preferred.or_else(|| self.selected_id.clone());
        let index = preferred
            .and_then(|id| rows.iter().position(|row| row.todo.id == id))
            .unwrap_or_else(|| self.selected.min(rows.len() - 1));
        self.selected = index;
        self.selected_id = Some(rows[index].todo.id.clone());
    }

    /// 서버 상태로 다시 맞춘다 (수동 새로고침, 쓰기 실패 후 복구).
    fn adopt(&mut self, data: crate::model::Data) {
        self.todos = data.todos;
        self.sessions = data.sessions;
        self.routines = data.routines;
        self.routine_selected = self.routine_selected.min(self.routines.len().saturating_sub(1));
        if let Some(active) = &self.category {
            if !self.categories().contains(active) {
                self.category = None;
            }
        }
        self.sync_selection(None);
    }

    /// 변경을 로컬에 즉시 반영하고 서버에는 백그라운드로 보낸다. 역연산을 돌려준다.
    fn perform(&mut self, op: Op) -> Op {
        match op {
            Op::Create(todo) => {
                let id = todo.id.clone();
                local::create(&mut self.todos, todo.clone());
                self.sync.send(Job::Create(todo));
                Op::Delete(id)
            }
            Op::Patch(id, patch) => {
                let inverse = self.inverse_patch(&id, &patch);
                local::patch(&mut self.todos, &id, &patch);
                self.sync.send(Job::Patch(id.clone(), patch));
                Op::Patch(id, inverse)
            }
            Op::Delete(id) => {
                let removed = local::delete(&mut self.todos, &id);
                self.sync.send(Job::Delete(id));
                Op::Restore(removed)
            }
            Op::Restore(todos) => {
                let id = todos.first().map(|todo| todo.id.clone()).unwrap_or_default();
                local::restore(&mut self.todos, &todos);
                self.sync.send(Job::Restore(todos));
                Op::Delete(id)
            }
            Op::Reorder(items) => {
                let before = normalized_items(&self.todos);
                local::reorder(&mut self.todos, &items);
                // 연타를 모아서 한 번만 보낸다. 보낼 내용은 flush 시점의 트리 전체다.
                self.reorder_due = Some(Instant::now() + REORDER_DEBOUNCE);
                Op::Reorder(before)
            }
        }
    }

    /// patch에 들어있는 필드들의 현재 값 (undo용)
    fn inverse_patch(&self, id: &str, patch: &Value) -> Value {
        let Some(todo) = self.todos.iter().find(|todo| todo.id == id) else {
            return json!({});
        };
        let mut inverse = serde_json::Map::new();
        if patch.get("title").is_some() {
            inverse.insert("title".into(), json!(todo.title));
        }
        if patch.get("dueDate").is_some() {
            inverse.insert("dueDate".into(), json!(todo.due_date));
        }
        if patch.get("category").is_some() {
            inverse.insert("category".into(), json!(todo.category.clone().unwrap_or_default()));
        }
        if patch.get("note").is_some() {
            inverse.insert("note".into(), json!(todo.note.clone().unwrap_or_default()));
        }
        if patch.get("scope").is_some() {
            inverse.insert("scope".into(), json!(todo.scope));
        }
        if patch.get("done").is_some() {
            inverse.insert("done".into(), json!(todo.done));
            inverse.insert("completedAt".into(), json!(todo.completed_at));
        }
        Value::Object(inverse)
    }

    fn mutate(&mut self, label: impl Into<String>, op: Op) {
        let inverse = self.perform(op);
        self.undo_stack.push(UndoEntry {
            label: label.into(),
            op: inverse,
        });
        if self.undo_stack.len() > 50 {
            self.undo_stack.remove(0);
        }
    }

    fn selected_row(&self) -> Option<Row> {
        self.rows().into_iter().nth(self.selected)
    }

    fn create_todo(&mut self, input: &str, parent_id: Option<String>) {
        // "제목 @0715"처럼 마감을 뒤에 붙일 수 있다. 안 붙이면 웹과 같이 오늘이 마감.
        let (title, due) = split_due_suffix(input);
        if title.is_empty() {
            return;
        }
        let parent = parent_id
            .as_deref()
            .and_then(|id| self.todos.iter().find(|todo| todo.id == id));
        let scope = parent.map(|todo| todo.scope.clone()).unwrap_or_else(|| "day".to_string());
        let category = if parent_id.is_some() { None } else { self.category.clone() };
        let due_date = if parent_id.is_some() {
            due
        } else {
            due.or_else(|| Some(today_key()))
        };
        if let Some(parent) = &parent_id {
            self.collapsed.remove(parent);
        }
        let todo = Todo {
            id: new_uuid(),
            title: title.clone(),
            scope: scope.clone(),
            done: false,
            created_at: now_iso(),
            completed_at: None,
            source_memo_id: None,
            due_date,
            category,
            note: None,
            routine_id: None,
            sort_order: Some(local::next_sort_order(&self.todos, &scope, parent_id.as_deref())),
            parent_id,
        };
        let id = todo.id.clone();
        self.mutate(format!("추가: {title}"), Op::Create(todo));
        self.sync_selection(Some(id));
    }

    fn apply_undo(&mut self) {
        let Some(entry) = self.undo_stack.pop() else {
            self.message = "되돌릴 작업 없음".to_string();
            return;
        };
        self.perform(entry.op);
        self.sync_selection(None);
        self.message = format!("되돌림: {}", entry.label);
    }

    /// debounce가 끝났으면 순서 저장을 실제로 보낸다.
    fn flush_reorder(&mut self, force: bool) {
        let Some(due) = self.reorder_due else { return };
        if !force && Instant::now() < due {
            return;
        }
        self.reorder_due = None;
        let items = normalized_items(&self.todos);
        self.sync.send(Job::Reorder(items));
    }

    /// 타이머가 끝났으면 알리고, 1분 이상이면 타임테이블에 기록한다.
    pub fn tick_timer(&mut self) {
        let Some(end) = self.timer.end_at else { return };
        if Instant::now() < end {
            return;
        }
        self.timer.end_at = None;
        let started_at = self.timer.started_at.take();
        self.message = "집중 끝! 잠깐 쉬세요.".to_string();
        print!("\x07"); // 터미널 벨
        let Some(started_at) = started_at else { return };
        if self.timer.minutes < 1 {
            return;
        }
        let session = json!({
            "id": new_uuid(),
            "label": "뽀모도로 집중",
            "startedAt": started_at,
            "endedAt": now_iso(),
        });
        self.sessions.push(Session {
            id: session["id"].as_str().unwrap_or_default().to_string(),
            label: "뽀모도로 집중".to_string(),
            started_at: session["startedAt"].as_str().unwrap_or_default().to_string(),
            ended_at: session["endedAt"].as_str().unwrap_or_default().to_string(),
        });
        self.sync.send(Job::CreateSession(session));
    }

    fn toggle_timer(&mut self) {
        if self.timer.end_at.is_some() {
            self.timer.end_at = None;
            self.timer.started_at = None;
            self.message = "타이머 정지".to_string();
            return;
        }
        self.timer.end_at = Some(Instant::now() + Duration::from_secs((self.timer.minutes * 60) as u64));
        self.timer.started_at = Some(now_iso());
        self.message = format!("{}분 집중 시작", self.timer.minutes);
    }

    fn quick_memo(&mut self, body: &str) {
        let memo = json!({
            "id": new_uuid(),
            "title": "",
            "body": body,
            "tags": extract_tags(body),
            "createdAt": now_iso(),
        });
        self.sync.send(Job::CreateMemo(memo));
        self.message = "메모 저장".to_string();
    }

    fn toggle_routine_active(&mut self) {
        let Some(routine) = self.routines.get_mut(self.routine_selected) else { return };
        routine.active = !routine.active;
        let (id, active) = (routine.id.clone(), routine.active);
        self.sync.send(Job::PatchRoutine(id, json!({ "active": active })));
        self.sync.send(Job::Refresh);
    }

    fn delete_routine(&mut self) {
        if self.routine_selected >= self.routines.len() {
            return;
        }
        let routine = self.routines.remove(self.routine_selected);
        self.routine_selected = self.routine_selected.min(self.routines.len().saturating_sub(1));
        self.message = format!("루틴 삭제: {}", routine.title);
        self.sync.send(Job::DeleteRoutine(routine.id));
    }

    fn drain_sync(&mut self) {
        while let Ok(event) = self.sync.events.try_recv() {
            match event {
                SyncEvent::Done => self.sync.settle(),
                SyncEvent::Failed(error) => {
                    self.sync.settle();
                    self.message = format!("저장 실패: {error}");
                    // 로컬이 서버와 어긋났으니 서버 상태를 다시 받아 맞춘다.
                    // 여러 쓰기가 한꺼번에 실패해도 새로고침은 한 번만 건다.
                    if !self.refresh_pending {
                        self.refresh_pending = true;
                        self.sync.send(Job::Refresh);
                    }
                }
                SyncEvent::Data(data) => {
                    self.refresh_pending = false;
                    self.adopt(*data);
                }
                SyncEvent::RefreshFailed(error) => {
                    // 여기서 다시 새로고침을 걸면 서버가 죽어 있을 때 무한 재시도가 된다.
                    // 로컬 상태는 그대로 두고, 복구는 사용자가 r 로 다시 시도한다.
                    self.refresh_pending = false;
                    self.message = format!("새로고침 실패: {error} (r 로 재시도)");
                }
            }
        }
    }

    fn submit_prompt(&mut self) {
        let Some(prompt) = self.prompt.take() else { return };
        let value = prompt.editor.value().trim().to_string();
        let before = self.todos.iter().find(|todo| todo.id == prompt.todo_id).cloned();
        match prompt.kind {
            PromptKind::Child => {
                if !value.is_empty() {
                    self.create_todo(&value, Some(prompt.todo_id));
                }
            }
            PromptKind::Edit => {
                if let (false, Some(before)) = (value.is_empty(), before) {
                    self.mutate(
                        format!("편집: {}", before.title),
                        Op::Patch(prompt.todo_id, json!({ "title": value })),
                    );
                }
            }
            PromptKind::Due => {
                if !value.is_empty() && !valid_date(&value) {
                    self.message = "마감일 형식: YYYY-MM-DD".to_string();
                    self.prompt = Some(prompt);
                    return;
                }
                let due = if value.is_empty() { Value::Null } else { json!(value) };
                self.mutate("마감일 변경", Op::Patch(prompt.todo_id, json!({ "dueDate": due })));
            }
            PromptKind::Category => {
                self.mutate(
                    "카테고리 변경",
                    Op::Patch(prompt.todo_id.clone(), json!({ "category": value })),
                );
                if self.category.is_some() && self.category.as_deref() != Some(value.as_str()) {
                    self.category = None;
                }
                self.sync_selection(Some(prompt.todo_id));
            }
            PromptKind::Memo => {
                if !value.is_empty() {
                    self.quick_memo(&value);
                }
            }
            PromptKind::Routine => {
                if value.is_empty() {
                    return;
                }
                let (title, weekdays) = split_weekdays(&value);
                if title.is_empty() {
                    self.message = "루틴 이름이 없습니다".to_string();
                    return;
                }
                let routine = json!({
                    "id": new_uuid(),
                    "title": title,
                    "weekdays": weekdays,
                    "createdAt": now_iso(),
                });
                self.sync.send(Job::CreateRoutine(routine));
                // 오늘 요일이면 서버가 오늘 할 일로 펼쳐주므로 목록을 다시 받는다.
                self.sync.send(Job::Refresh);
                self.message = format!("루틴 추가: {title}");
            }
        }
    }

    fn cycle_category(&mut self, forward: bool) {
        let mut tabs: Vec<Option<String>> = vec![None];
        tabs.extend(self.categories().into_iter().map(Some));
        let current = tabs.iter().position(|tab| *tab == self.category).unwrap_or(0);
        let next = if forward {
            (current + 1) % tabs.len()
        } else {
            (current + tabs.len() - 1) % tabs.len()
        };
        self.category = tabs[next].clone();
        self.selected = 0;
        self.selected_id = None;
        self.sync_selection(None);
    }

    fn move_selection(&mut self, down: bool) {
        let rows = self.rows();
        if rows.is_empty() {
            return;
        }
        let next = if down {
            (self.selected + 1).min(rows.len() - 1)
        } else {
            self.selected.saturating_sub(1)
        };
        self.selected = next;
        self.selected_id = Some(rows[next].todo.id.clone());
    }

    /// 옮긴 뒤의 트리를 Op::Reorder 항목으로 만든다.
    fn reorder_items(&self, changed: &[Todo]) -> Vec<OrderItem> {
        let mut next = self.todos.clone();
        for todo in changed {
            if let Some(slot) = next.iter_mut().find(|item| item.id == todo.id) {
                *slot = todo.clone();
            }
        }
        normalized_items(&next)
    }

    fn reorder_selected(&mut self, down: bool) {
        let Some(row) = self.selected_row() else { return };
        let scope = row.todo.scope.clone();
        let parent = row.todo.parent_id.clone();
        let siblings: Vec<Todo> = ordered_siblings(&self.todos, &scope, parent.as_deref())
            .into_iter()
            .cloned()
            .collect();
        // 카테고리 탭을 보고 있으면 그 탭 안의 이웃끼리만 자리를 바꾼다.
        let visible_ids: Vec<String> = if parent.is_some() || self.category.is_none() {
            siblings.iter().map(|todo| todo.id.clone()).collect()
        } else {
            siblings
                .iter()
                .filter(|todo| todo.category == self.category)
                .map(|todo| todo.id.clone())
                .collect()
        };
        let Some(visible_index) = visible_ids.iter().position(|id| *id == row.todo.id) else {
            return;
        };
        let other_visible = if down { visible_index + 1 } else { visible_index.wrapping_sub(1) };
        let Some(other_id) = visible_ids.get(other_visible) else { return };

        let mut ids: Vec<String> = siblings.iter().map(|todo| todo.id.clone()).collect();
        let index = ids.iter().position(|id| *id == row.todo.id).expect("선택 항목은 형제 목록에 있다");
        let other_index = ids.iter().position(|id| id == other_id).expect("이웃도 형제 목록에 있다");
        ids.swap(index, other_index);
        let order: HashMap<&String, usize> = ids.iter().enumerate().map(|(position, id)| (id, position)).collect();
        let changed: Vec<Todo> = siblings
            .into_iter()
            .map(|mut todo| {
                todo.sort_order = order.get(&todo.id).map(|position| *position as f64);
                todo
            })
            .collect();
        let items = self.reorder_items(&changed);
        self.mutate("이동", Op::Reorder(items));
        self.sync_selection(Some(row.todo.id));
    }

    fn nest_selected(&mut self) {
        let Some(row) = self.selected_row() else { return };
        if row.depth != 0 {
            return;
        }
        let filter = self.category.clone();
        let roots: Vec<&Todo> = ordered_siblings(&self.todos, &row.todo.scope, None)
            .into_iter()
            .filter(|todo| filter.is_none() || todo.category == filter)
            .collect();
        let Some(index) = roots.iter().position(|todo| todo.id == row.todo.id) else {
            return;
        };
        if index == 0 {
            return;
        }
        let parent_id = roots[index - 1].id.clone();
        let child_count = ordered_siblings(&self.todos, &row.todo.scope, Some(&parent_id)).len();
        let mut moved = row.todo.clone();
        moved.parent_id = Some(parent_id.clone());
        moved.sort_order = Some(child_count as f64);
        let items = self.reorder_items(&[moved]);
        self.collapsed.remove(&parent_id);
        self.mutate("이동", Op::Reorder(items));
        self.sync_selection(Some(row.todo.id));
    }

    fn unnest_selected(&mut self) {
        let Some(row) = self.selected_row() else { return };
        if row.depth != 1 {
            return;
        }
        let Some(parent) = self
            .todos
            .iter()
            .find(|todo| Some(&todo.id) == row.todo.parent_id.as_ref())
            .cloned()
        else {
            return;
        };
        let mut moved = row.todo.clone();
        moved.parent_id = None;
        // 부모 바로 다음 자리로 올린다. normalized_items가 정수 순번으로 다시 매긴다.
        moved.sort_order = Some(parent.sort_order.unwrap_or(0.0) + 0.5);
        let items = self.reorder_items(&[moved]);
        self.mutate("이동", Op::Reorder(items));
        self.sync_selection(Some(row.todo.id));
    }

    fn toggle_selected(&mut self) {
        let Some(row) = self.selected_row() else { return };
        let done = !row.todo.done;
        let patch = json!({
            "done": done,
            "completedAt": if done { json!(now_iso()) } else { Value::Null },
        });
        self.mutate(format!("완료 토글: {}", row.todo.title), Op::Patch(row.todo.id, patch));
    }

    fn delete_selected(&mut self) {
        let Some(row) = self.selected_row() else { return };
        self.mutate(format!("삭제: {}", row.todo.title), Op::Delete(row.todo.id));
        self.sync_selection(None);
    }

    fn open_prompt(&mut self, kind: PromptKind) {
        let Some(row) = self.selected_row() else { return };
        let (label, initial, target) = match kind {
            // 이 둘은 선택된 할 일과 무관하므로 open_free_prompt로 연다.
            PromptKind::Memo | PromptKind::Routine => return self.open_free_prompt(kind),
            PromptKind::Child => {
                let parent = if row.depth == 0 {
                    row.todo.clone()
                } else {
                    match self
                        .todos
                        .iter()
                        .find(|todo| Some(&todo.id) == row.todo.parent_id.as_ref())
                    {
                        Some(parent) => parent.clone(),
                        None => return,
                    }
                };
                ("하위 목표".to_string(), String::new(), parent.id)
            }
            PromptKind::Edit => ("내용 편집".to_string(), row.todo.title.clone(), row.todo.id.clone()),
            PromptKind::Due => (
                "마감일 YYYY-MM-DD (비우면 해제)".to_string(),
                row.todo.due_date.clone().unwrap_or_default(),
                row.todo.id.clone(),
            ),
            PromptKind::Category => {
                let target = if row.depth == 0 {
                    row.todo.clone()
                } else {
                    match self
                        .todos
                        .iter()
                        .find(|todo| Some(&todo.id) == row.todo.parent_id.as_ref())
                    {
                        Some(parent) => parent.clone(),
                        None => return,
                    }
                };
                (
                    "카테고리 (비우면 해제)".to_string(),
                    target.category.clone().unwrap_or_default(),
                    target.id,
                )
            }
        };
        self.prompt = Some(Prompt {
            kind,
            label,
            editor: Editor::new(&initial),
            todo_id: target,
        });
    }

    /// 오버레이가 떠 있는 동안의 키. 처리했으면 true.
    fn handle_overlay_key(&mut self, key: &KeyEvent) -> bool {
        match self.overlay.clone() {
            Overlay::None => false,
            Overlay::Help | Overlay::Timetable => {
                // 읽기만 하는 오버레이는 아무 키나 눌러 닫는다.
                self.overlay = Overlay::None;
                true
            }
            Overlay::Pomodoro => {
                match key.code {
                    KeyCode::Esc | KeyCode::Char('p') | KeyCode::Char('q') => self.overlay = Overlay::None,
                    KeyCode::Enter | KeyCode::Char(' ') => self.toggle_timer(),
                    KeyCode::Char('+') | KeyCode::Char('=') | KeyCode::Up | KeyCode::Char('k') => {
                        if self.timer.end_at.is_none() {
                            self.timer.minutes = (self.timer.minutes + 5).min(180);
                        }
                    }
                    KeyCode::Char('-') | KeyCode::Down | KeyCode::Char('j') => {
                        if self.timer.end_at.is_none() {
                            self.timer.minutes = (self.timer.minutes - 5).max(1);
                        }
                    }
                    _ => {}
                }
                true
            }
            Overlay::Routines => {
                match key.code {
                    KeyCode::Esc | KeyCode::Char('R') | KeyCode::Char('q') => self.overlay = Overlay::None,
                    KeyCode::Char('j') | KeyCode::Down => {
                        self.routine_selected = (self.routine_selected + 1).min(self.routines.len().saturating_sub(1));
                    }
                    KeyCode::Char('k') | KeyCode::Up => {
                        self.routine_selected = self.routine_selected.saturating_sub(1);
                    }
                    KeyCode::Char('n') => self.open_free_prompt(PromptKind::Routine),
                    KeyCode::Char(' ') => self.toggle_routine_active(),
                    KeyCode::Char('d') => self.delete_routine(),
                    // 요일 1~7 = 일~토 토글
                    KeyCode::Char(ch @ '1'..='7') => {
                        let day = ch as u8 - b'1';
                        if let Some(routine) = self.routines.get_mut(self.routine_selected) {
                            if routine.weekdays.contains(&day) {
                                routine.weekdays.retain(|item| *item != day);
                            } else {
                                routine.weekdays.push(day);
                                routine.weekdays.sort_unstable();
                            }
                            let (id, weekdays) = (routine.id.clone(), routine.weekdays.clone());
                            self.sync.send(Job::PatchRoutine(id, json!({ "weekdays": weekdays })));
                            self.sync.send(Job::Refresh);
                        }
                    }
                    _ => {}
                }
                true
            }
        }
    }

    /// 선택된 할 일과 무관한 프롬프트 (메모, 루틴 추가)
    fn open_free_prompt(&mut self, kind: PromptKind) {
        let label = match kind {
            PromptKind::Memo => "메모 (#태그 가능)",
            _ => "루틴 (예: 필라테스 월수금 / 약 먹기 매일)",
        };
        self.prompt = Some(Prompt {
            kind,
            label: label.to_string(),
            editor: Editor::new(""),
            todo_id: String::new(),
        });
    }

    fn handle_key(&mut self, key: KeyEvent) {
        self.message.clear();
        let shift = key.modifiers.contains(KeyModifiers::SHIFT);
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
        if ctrl && key.code == KeyCode::Char('c') {
            self.quit = true;
            return;
        }

        if self.prompt.is_none() && self.handle_overlay_key(&key) {
            return;
        }

        if self.prompt.is_some() {
            match key.code {
                KeyCode::Esc => self.prompt = None,
                KeyCode::Enter => self.submit_prompt(),
                _ => {
                    if let Some(prompt) = &mut self.prompt {
                        prompt.editor.handle(&key);
                    }
                }
            }
            return;
        }

        match key.code {
            KeyCode::Tab => return self.cycle_category(true),
            KeyCode::BackTab => return self.cycle_category(false),
            _ => {}
        }

        let editing_input = self.mode == Mode::Insert && !self.input.chars.is_empty();
        match key.code {
            KeyCode::Up if shift => self.reorder_selected(false),
            KeyCode::Down if shift => self.reorder_selected(true),
            KeyCode::Left if shift && !editing_input => self.nest_selected(),
            KeyCode::Right if shift && !editing_input => self.unnest_selected(),
            KeyCode::Up => self.move_selection(false),
            KeyCode::Down => self.move_selection(true),
            KeyCode::Left | KeyCode::Right if !editing_input => self.fold_selected(key.code == KeyCode::Left),
            _ => {
                if self.mode == Mode::Insert {
                    match key.code {
                        KeyCode::Esc => self.mode = Mode::Normal,
                        KeyCode::Enter => {
                            let title = self.input.value().trim().to_string();
                            if !title.is_empty() {
                                self.input = Editor::new("");
                                self.create_todo(&title, None);
                            }
                        }
                        _ => {
                            self.input.handle(&key);
                        }
                    }
                } else {
                    self.handle_normal_key(&key);
                }
            }
        }
    }

    fn fold_selected(&mut self, fold: bool) {
        let Some(row) = self.selected_row() else { return };
        if row.depth == 0 && row.children_total > 0 {
            if fold {
                self.collapsed.insert(row.todo.id.clone());
            } else {
                self.collapsed.remove(&row.todo.id);
            }
            self.sync_selection(Some(row.todo.id));
        }
    }

    fn handle_normal_key(&mut self, key: &KeyEvent) {
        match key.code {
            KeyCode::Char('?') => self.overlay = Overlay::Help,
            KeyCode::Char('p') => self.overlay = Overlay::Pomodoro,
            KeyCode::Char('T') => self.overlay = Overlay::Timetable,
            KeyCode::Char('R') => self.overlay = Overlay::Routines,
            KeyCode::Char('m') => self.open_free_prompt(PromptKind::Memo),
            KeyCode::Char('n') => self.open_free_prompt(PromptKind::Routine),
            KeyCode::Char('i') | KeyCode::Char('a') | KeyCode::Esc => self.mode = Mode::Insert,
            KeyCode::Char('q') => self.quit = true,
            KeyCode::Char('j') => self.move_selection(true),
            KeyCode::Char('k') => self.move_selection(false),
            KeyCode::Char('h') => self.fold_selected(true),
            KeyCode::Char('l') => self.fold_selected(false),
            KeyCode::Char('s') => self.open_prompt(PromptKind::Child),
            KeyCode::Char('e') => self.open_prompt(PromptKind::Edit),
            KeyCode::Char('t') => self.open_prompt(PromptKind::Due),
            KeyCode::Char('c') => self.open_prompt(PromptKind::Category),
            KeyCode::Char(' ') => self.toggle_selected(),
            KeyCode::Char('d') => self.delete_selected(),
            KeyCode::Char('u') => self.apply_undo(),
            KeyCode::Char('r') => {
                if !self.refresh_pending {
                    self.refresh_pending = true;
                    self.sync.send(Job::Refresh);
                }
                self.message = "새로고침…".to_string();
            }
            _ => {}
        }
    }
}

/// 종료 직전, 아직 안 나간 쓰기를 보내고 서버 응답까지 기다린다.
fn drain_on_quit(app: &mut App) {
    app.flush_reorder(true);
    let deadline = Instant::now() + Duration::from_secs(5);
    while app.sync.in_flight > 0 && Instant::now() < deadline {
        match app.sync.events.recv_timeout(Duration::from_millis(200)) {
            Ok(SyncEvent::Done) | Ok(SyncEvent::Failed(_)) => app.sync.settle(),
            Ok(SyncEvent::Data(_)) | Ok(SyncEvent::RefreshFailed(_)) => {}
            Err(_) => {}
        }
    }
}

pub fn run(client: Client) -> Result<(), String> {
    let data = {
        // 첫 데이터만 동기로 받고, 이후 네트워크는 전부 워커 스레드가 맡는다.
        let mut client = client;
        client.fetch_data()?
    };
    let sync = Sync::spawn(Client::new());
    let mut app = App::new(sync, data);

    let mut terminal = ratatui::init();
    loop {
        if terminal.draw(|frame| ui::render(frame, &app)).is_err() {
            break;
        }
        // 키를 기다리되, debounce 만료와 워커 응답 처리를 위해 최대 100ms만 블록한다.
        let timeout = app
            .reorder_due
            .map(|due| due.saturating_duration_since(Instant::now()))
            .unwrap_or(Duration::from_millis(100))
            .min(Duration::from_millis(100));
        match event::poll(timeout) {
            Ok(true) => match event::read() {
                Ok(Event::Key(key)) if key.kind == KeyEventKind::Press => app.handle_key(key),
                Ok(_) => {}
                Err(_) => break,
            },
            Ok(false) => {}
            Err(_) => break,
        }
        app.drain_sync();
        app.flush_reorder(false);
        app.tick_timer();
        if app.quit {
            break;
        }
    }
    drain_on_quit(&mut app);
    ratatui::restore();
    Ok(())
}
