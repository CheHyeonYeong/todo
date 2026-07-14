use serde::{Deserialize, Serialize};
use std::collections::HashSet;

fn default_scope() -> String {
    "day".to_string()
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Data {
    #[serde(default)]
    pub todos: Vec<Todo>,
    #[serde(default)]
    pub memos: Vec<Memo>,
    #[serde(default)]
    pub sessions: Vec<Session>,
    #[serde(default)]
    pub routines: Vec<Routine>,
}

/// 요일별 반복 할 일. weekdays는 0=일 ~ 6=토. 서버가 해당 요일에 오늘 할 일로 펼친다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Routine {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub weekdays: Vec<u8>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default = "default_true")]
    pub active: bool,
    #[serde(default)]
    pub created_at: String,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Memo {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub starred: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub started_at: String,
    #[serde(default)]
    pub ended_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default = "default_scope")]
    pub scope: String,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub completed_at: Option<String>,
    #[serde(default)]
    pub source_memo_id: Option<String>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    /// 루틴이 만든 할 일이면 그 루틴의 id (목록에서 ↻ 로 표시)
    #[serde(default)]
    pub routine_id: Option<String>,
    #[serde(default)]
    pub sort_order: Option<f64>,
}

impl Todo {
    fn order_value(&self) -> f64 {
        self.sort_order.unwrap_or(f64::MAX)
    }
}

pub const SCOPES: [&str; 3] = ["day", "week", "month"];

pub fn scope_label(scope: &str) -> &'static str {
    match scope {
        "week" => "이번 주",
        "month" => "이번 달",
        _ => "오늘",
    }
}

pub fn ordered_siblings<'a>(todos: &'a [Todo], scope: &str, parent: Option<&str>) -> Vec<&'a Todo> {
    let mut siblings: Vec<&Todo> = todos
        .iter()
        .filter(|todo| todo.scope == scope && todo.parent_id.as_deref() == parent)
        .collect();
    siblings.sort_by(|a, b| {
        // 완료한 일은 목록 아래로 내린다.
        a.done
            .cmp(&b.done)
            .then_with(|| {
                a.order_value()
                    .partial_cmp(&b.order_value())
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| a.created_at.cmp(&b.created_at))
    });
    siblings
}

#[derive(Debug, Clone)]
pub struct Row {
    pub todo: Todo,
    pub depth: usize,
    pub last: bool,
    pub children_total: usize,
    pub children_done: usize,
}

pub fn visible_tree(todos: &[Todo], collapsed: &HashSet<String>, category: Option<&str>) -> Vec<Row> {
    let mut rows = Vec::new();
    for scope in SCOPES {
        for root in ordered_siblings(todos, scope, None) {
            if let Some(filter) = category {
                if root.category.as_deref() != Some(filter) {
                    continue;
                }
            }
            let children = ordered_siblings(todos, scope, Some(&root.id));
            rows.push(Row {
                todo: (*root).clone(),
                depth: 0,
                last: false,
                children_total: children.len(),
                children_done: children.iter().filter(|child| child.done).count(),
            });
            if !collapsed.contains(&root.id) {
                let count = children.len();
                for (index, child) in children.into_iter().enumerate() {
                    rows.push(Row {
                        todo: (*child).clone(),
                        depth: 1,
                        last: index + 1 == count,
                        children_total: 0,
                        children_done: 0,
                    });
                }
            }
        }
    }
    rows
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderItem {
    pub id: String,
    pub parent_id: Option<String>,
    pub sort_order: f64,
    pub scope: String,
}

pub fn normalized_items(todos: &[Todo]) -> Vec<OrderItem> {
    let mut items = Vec::new();
    for scope in SCOPES {
        for (root_index, root) in ordered_siblings(todos, scope, None).into_iter().enumerate() {
            items.push(OrderItem {
                id: root.id.clone(),
                parent_id: None,
                sort_order: root_index as f64,
                scope: scope.to_string(),
            });
            for (child_index, child) in ordered_siblings(todos, scope, Some(&root.id)).into_iter().enumerate() {
                items.push(OrderItem {
                    id: child.id.clone(),
                    parent_id: Some(root.id.clone()),
                    sort_order: child_index as f64,
                    scope: scope.to_string(),
                });
            }
        }
    }
    items
}

pub fn category_list(todos: &[Todo]) -> Vec<String> {
    let mut names: Vec<String> = todos
        .iter()
        .filter(|todo| todo.parent_id.is_none())
        .filter_map(|todo| todo.category.clone())
        .collect();
    names.sort();
    names.dedup();
    names
}

/// 리스트 명령의 번호와 같은 순서 (오늘 -> 이번 주 -> 이번 달, 부모 뒤에 자식)
pub fn flattened(todos: &[Todo]) -> Vec<Todo> {
    let mut flat = Vec::new();
    for scope in SCOPES {
        for root in ordered_siblings(todos, scope, None) {
            flat.push(root.clone());
            for child in ordered_siblings(todos, scope, Some(&root.id)) {
                flat.push(child.clone());
            }
        }
    }
    flat
}

pub fn extract_tags(text: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if chars[index] == '#' {
            let start = index + 1;
            let mut end = start;
            while end < chars.len() && (chars[end].is_alphanumeric() || chars[end] == '_' || chars[end] == '-') {
                end += 1;
            }
            if end > start {
                tags.push(chars[start..end].iter().collect());
            }
            index = end;
        } else {
            index += 1;
        }
    }
    tags
}

/// 메모 본문에서 `- [ ] 할 일` / `todo: 할 일` 줄을 뽑아낸다.
pub fn extract_todos(text: &str) -> Vec<String> {
    text.lines()
        .filter_map(|line| {
            let trimmed = line.trim_start();
            let rest = if let Some(rest) = trimmed.strip_prefix("- [ ]").or_else(|| trimmed.strip_prefix("- []")) {
                rest
            } else if trimmed.get(..5).is_some_and(|head| head.eq_ignore_ascii_case("todo:")) {
                &trimmed[5..]
            } else {
                return None;
            };
            let title = rest.trim();
            (!title.is_empty()).then(|| title.to_string())
        })
        .collect()
}

pub fn valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            4 | 7 => *byte == b'-',
            _ => byte.is_ascii_digit(),
        })
}
