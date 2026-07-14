mod api;
mod model;
mod ui;

use api::Client;
use model::{category_list, normalized_items, ordered_siblings, valid_date, visible_tree, OrderItem, Row, Todo};
use ratatui::crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

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

pub enum UndoOp {
    DeleteCreated(String),
    Patch(String, Value),
    Restore(Vec<Todo>),
    Reorder(Vec<OrderItem>),
}

pub struct UndoEntry {
    pub label: String,
    pub op: UndoOp,
}

pub struct App {
    pub client: Client,
    pub todos: Vec<Todo>,
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
}

fn new_uuid() -> String {
    let mut bytes = [0u8; 16];
    getrandom(&mut bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: Vec<String> = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    format!(
        "{}{}{}{}-{}{}-{}{}-{}{}-{}{}{}{}{}{}",
        hex[0], hex[1], hex[2], hex[3], hex[4], hex[5], hex[6], hex[7],
        hex[8], hex[9], hex[10], hex[11], hex[12], hex[13], hex[14], hex[15]
    )
}

fn getrandom(buffer: &mut [u8]) {
    // /dev/urandom이 없는 플랫폼은 시간 기반으로 대체 (id 충돌 가능성만 감수)
    if std::fs::File::open("/dev/urandom")
        .and_then(|mut file| std::io::Read::read_exact(&mut file, buffer))
        .is_ok()
    {
        return;
    }
    let mut seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    for byte in buffer.iter_mut() {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        *byte = (seed >> 33) as u8;
    }
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

impl App {
    fn new() -> Self {
        App {
            client: Client::new(),
            todos: Vec::new(),
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
        }
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

    fn refresh(&mut self, preferred: Option<String>) -> Result<(), String> {
        self.todos = self.client.fetch_todos()?;
        if let Some(active) = &self.category {
            if !self.categories().contains(active) {
                self.category = None;
            }
        }
        self.sync_selection(preferred);
        Ok(())
    }

    fn push_undo(&mut self, label: impl Into<String>, op: UndoOp) {
        self.undo_stack.push(UndoEntry { label: label.into(), op });
        if self.undo_stack.len() > 50 {
            self.undo_stack.remove(0);
        }
    }

    fn selected_row(&self) -> Option<Row> {
        self.rows().into_iter().nth(self.selected)
    }

    fn create_todo(&mut self, title: &str, parent_id: Option<String>) -> Result<(), String> {
        let parent_scope = parent_id
            .as_deref()
            .and_then(|id| self.todos.iter().find(|todo| todo.id == id))
            .map(|todo| todo.scope.clone());
        let id = new_uuid();
        let mut body = json!({
            "id": id,
            "title": title,
            "scope": parent_scope.unwrap_or_else(|| "day".to_string()),
            "done": false,
            "createdAt": now_iso(),
        });
        if let Some(parent) = &parent_id {
            body["parentId"] = json!(parent);
            self.collapsed.remove(parent);
        } else if let Some(category) = &self.category {
            body["category"] = json!(category);
        }
        self.client.create_todo(&body)?;
        self.push_undo(format!("추가: {title}"), UndoOp::DeleteCreated(id.clone()));
        self.refresh(Some(id))
    }

    fn patch_with_undo(&mut self, id: &str, patch: Value, undo_label: String, undo_patch: Value) -> Result<(), String> {
        self.client.patch_todo(id, &patch)?;
        self.push_undo(undo_label, UndoOp::Patch(id.to_string(), undo_patch));
        self.refresh(Some(id.to_string()))
    }

    fn save_tree(&mut self, next: &[Todo], preferred: Option<String>) -> Result<(), String> {
        let before = normalized_items(&self.todos);
        self.client.reorder(&normalized_items(next))?;
        self.push_undo("이동", UndoOp::Reorder(before));
        self.refresh(preferred)
    }

    fn apply_undo(&mut self) -> Result<(), String> {
        let Some(entry) = self.undo_stack.pop() else {
            self.message = "되돌릴 작업 없음".to_string();
            return Ok(());
        };
        match &entry.op {
            UndoOp::DeleteCreated(id) => self.client.delete_todo(id)?,
            UndoOp::Patch(id, patch) => self.client.patch_todo(id, patch)?,
            UndoOp::Restore(todos) => {
                for todo in todos {
                    self.client.restore_todo(todo)?;
                }
            }
            UndoOp::Reorder(items) => self.client.reorder(items)?,
        }
        self.refresh(None)?;
        self.message = format!("되돌림: {}", entry.label);
        Ok(())
    }

    fn submit_prompt(&mut self) -> Result<(), String> {
        let Some(prompt) = self.prompt.take() else { return Ok(()) };
        let value = prompt.editor.value().trim().to_string();
        let before = self.todos.iter().find(|todo| todo.id == prompt.todo_id).cloned();
        match prompt.kind {
            PromptKind::Child => {
                if !value.is_empty() {
                    self.create_todo(&value, Some(prompt.todo_id))?;
                }
            }
            PromptKind::Edit => {
                if let (false, Some(before)) = (value.is_empty(), before) {
                    self.patch_with_undo(
                        &prompt.todo_id,
                        json!({ "title": value }),
                        format!("편집: {}", before.title),
                        json!({ "title": before.title }),
                    )?;
                }
            }
            PromptKind::Due => {
                if !value.is_empty() && !valid_date(&value) {
                    self.message = "마감일 형식: YYYY-MM-DD".to_string();
                    self.prompt = Some(prompt);
                    return Ok(());
                }
                let due = if value.is_empty() { Value::Null } else { json!(value) };
                let previous = before.and_then(|todo| todo.due_date).map(Value::from).unwrap_or(Value::Null);
                self.patch_with_undo(
                    &prompt.todo_id,
                    json!({ "dueDate": due }),
                    "마감일 변경".to_string(),
                    json!({ "dueDate": previous }),
                )?;
            }
            PromptKind::Category => {
                let previous = before.and_then(|todo| todo.category).unwrap_or_default();
                self.patch_with_undo(
                    &prompt.todo_id,
                    json!({ "category": value }),
                    "카테고리 변경".to_string(),
                    json!({ "category": previous }),
                )?;
                if self.category.is_some() && self.category.as_deref() != Some(value.as_str()) {
                    self.category = None;
                    self.sync_selection(Some(prompt.todo_id));
                }
            }
        }
        Ok(())
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

    fn reorder_selected(&mut self, down: bool) -> Result<(), String> {
        let Some(row) = self.selected_row() else { return Ok(()) };
        let scope = row.todo.scope.clone();
        let parent = row.todo.parent_id.clone();
        let sibling_ids: Vec<String> = ordered_siblings(&self.todos, &scope, parent.as_deref())
            .into_iter()
            .map(|todo| todo.id.clone())
            .collect();
        let visible_ids: Vec<String> = if parent.is_some() || self.category.is_none() {
            sibling_ids.clone()
        } else {
            let filter = self.category.clone();
            ordered_siblings(&self.todos, &scope, None)
                .into_iter()
                .filter(|todo| todo.category == filter)
                .map(|todo| todo.id.clone())
                .collect()
        };
        let Some(visible_index) = visible_ids.iter().position(|id| *id == row.todo.id) else {
            return Ok(());
        };
        let other_visible = if down { visible_index + 1 } else { visible_index.wrapping_sub(1) };
        let Some(other_id) = visible_ids.get(other_visible) else { return Ok(()) };
        let mut ids = sibling_ids;
        let index = ids.iter().position(|id| *id == row.todo.id).unwrap();
        let other_index = ids.iter().position(|id| id == other_id).unwrap();
        ids.swap(index, other_index);
        let order: HashMap<&String, usize> = ids.iter().enumerate().map(|(position, id)| (id, position)).collect();
        let next: Vec<Todo> = self
            .todos
            .iter()
            .cloned()
            .map(|mut todo| {
                if let Some(position) = order.get(&todo.id) {
                    todo.sort_order = Some(*position as f64);
                }
                todo
            })
            .collect();
        self.save_tree(&next, Some(row.todo.id.clone()))
    }

    fn nest_selected(&mut self) -> Result<(), String> {
        let Some(row) = self.selected_row() else { return Ok(()) };
        if row.depth != 0 {
            return Ok(());
        }
        let filter = self.category.clone();
        let roots: Vec<&Todo> = ordered_siblings(&self.todos, &row.todo.scope, None)
            .into_iter()
            .filter(|todo| filter.is_none() || todo.category == filter)
            .collect();
        let Some(index) = roots.iter().position(|todo| todo.id == row.todo.id) else {
            return Ok(());
        };
        if index == 0 {
            return Ok(());
        }
        let parent_id = roots[index - 1].id.clone();
        let child_count = ordered_siblings(&self.todos, &row.todo.scope, Some(&parent_id)).len();
        let next: Vec<Todo> = self
            .todos
            .iter()
            .cloned()
            .map(|mut todo| {
                if todo.id == row.todo.id {
                    todo.parent_id = Some(parent_id.clone());
                    todo.sort_order = Some(child_count as f64);
                }
                todo
            })
            .collect();
        self.collapsed.remove(&parent_id);
        self.save_tree(&next, Some(row.todo.id.clone()))
    }

    fn unnest_selected(&mut self) -> Result<(), String> {
        let Some(row) = self.selected_row() else { return Ok(()) };
        if row.depth != 1 {
            return Ok(());
        }
        let Some(parent) = self
            .todos
            .iter()
            .find(|todo| Some(&todo.id) == row.todo.parent_id.as_ref())
            .cloned()
        else {
            return Ok(());
        };
        let parent_order = parent.sort_order.unwrap_or(f64::MAX - 1.0);
        let next: Vec<Todo> = self
            .todos
            .iter()
            .cloned()
            .map(|mut todo| {
                if todo.id == row.todo.id {
                    todo.parent_id = None;
                    todo.sort_order = Some(parent_order + 0.5);
                }
                todo
            })
            .collect();
        self.save_tree(&next, Some(row.todo.id.clone()))
    }

    fn toggle_selected(&mut self) -> Result<(), String> {
        let Some(row) = self.selected_row() else { return Ok(()) };
        let was_done = row.todo.done;
        let patch = json!({
            "done": !was_done,
            "completedAt": if !was_done { json!(now_iso()) } else { Value::Null },
        });
        let undo_completed = if was_done {
            json!(row.todo.completed_at.clone().unwrap_or_else(now_iso))
        } else {
            Value::Null
        };
        self.patch_with_undo(
            &row.todo.id,
            patch,
            format!("완료 토글: {}", row.todo.title),
            json!({ "done": was_done, "completedAt": undo_completed }),
        )
    }

    fn delete_selected(&mut self) -> Result<(), String> {
        let Some(row) = self.selected_row() else { return Ok(()) };
        let mut removed = vec![row.todo.clone()];
        removed.extend(
            self.todos
                .iter()
                .filter(|todo| todo.parent_id.as_deref() == Some(&row.todo.id))
                .cloned(),
        );
        self.client.delete_todo(&row.todo.id)?;
        self.push_undo(format!("삭제: {}", row.todo.title), UndoOp::Restore(removed));
        self.refresh(None)
    }

    fn open_prompt(&mut self, kind: PromptKind) {
        let Some(row) = self.selected_row() else { return };
        let (label, initial, target) = match kind {
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

    fn handle_key(&mut self, key: KeyEvent) {
        self.message.clear();
        let shift = key.modifiers.contains(KeyModifiers::SHIFT);
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
        if ctrl && key.code == KeyCode::Char('c') {
            self.quit = true;
            return;
        }

        if self.prompt.is_some() {
            match key.code {
                KeyCode::Esc => self.prompt = None,
                KeyCode::Enter => {
                    if let Err(error) = self.submit_prompt() {
                        self.message = error;
                    }
                }
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
        let result: Result<(), String> = match key.code {
            KeyCode::Up if shift => self.reorder_selected(false),
            KeyCode::Down if shift => self.reorder_selected(true),
            KeyCode::Left if shift && !editing_input => self.nest_selected(),
            KeyCode::Right if shift && !editing_input => self.unnest_selected(),
            KeyCode::Up => {
                self.move_selection(false);
                Ok(())
            }
            KeyCode::Down => {
                self.move_selection(true);
                Ok(())
            }
            KeyCode::Left | KeyCode::Right if !editing_input => {
                self.fold_selected(key.code == KeyCode::Left);
                Ok(())
            }
            _ => {
                if self.mode == Mode::Insert {
                    match key.code {
                        KeyCode::Esc => {
                            self.mode = Mode::Normal;
                            Ok(())
                        }
                        KeyCode::Enter => {
                            let title = self.input.value().trim().to_string();
                            if title.is_empty() {
                                Ok(())
                            } else {
                                self.input = Editor::new("");
                                self.create_todo(&title, None)
                            }
                        }
                        _ => {
                            self.input.handle(&key);
                            Ok(())
                        }
                    }
                } else {
                    self.handle_normal_key(&key)
                }
            }
        };
        if let Err(error) = result {
            self.message = error;
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

    fn handle_normal_key(&mut self, key: &KeyEvent) -> Result<(), String> {
        match key.code {
            KeyCode::Char('i') | KeyCode::Char('a') | KeyCode::Esc => {
                self.mode = Mode::Insert;
                Ok(())
            }
            KeyCode::Char('q') => {
                self.quit = true;
                Ok(())
            }
            KeyCode::Char('j') => {
                self.move_selection(true);
                Ok(())
            }
            KeyCode::Char('k') => {
                self.move_selection(false);
                Ok(())
            }
            KeyCode::Char('h') => {
                self.fold_selected(true);
                Ok(())
            }
            KeyCode::Char('l') => {
                self.fold_selected(false);
                Ok(())
            }
            KeyCode::Char('s') => {
                self.open_prompt(PromptKind::Child);
                Ok(())
            }
            KeyCode::Char('e') => {
                self.open_prompt(PromptKind::Edit);
                Ok(())
            }
            KeyCode::Char('t') => {
                self.open_prompt(PromptKind::Due);
                Ok(())
            }
            KeyCode::Char('c') => {
                self.open_prompt(PromptKind::Category);
                Ok(())
            }
            KeyCode::Char(' ') => self.toggle_selected(),
            KeyCode::Char('d') => self.delete_selected(),
            KeyCode::Char('u') => self.apply_undo(),
            _ => Ok(()),
        }
    }
}

fn main() {
    let mut app = App::new();
    if let Err(error) = app.refresh(None) {
        eprintln!("{error}");
        std::process::exit(1);
    }
    let mut terminal = ratatui::init();
    loop {
        if terminal.draw(|frame| ui::render(frame, &app)).is_err() {
            break;
        }
        match event::read() {
            Ok(Event::Key(key)) if key.kind == KeyEventKind::Press => app.handle_key(key),
            Ok(_) => {}
            Err(_) => break,
        }
        if app.quit {
            break;
        }
    }
    ratatui::restore();
}
