use serde::{Deserialize, Serialize};
use std::collections::HashSet;

fn default_scope() -> String {
    "day".to_string()
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
        a.order_value()
            .partial_cmp(&b.order_value())
            .unwrap_or(std::cmp::Ordering::Equal)
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

pub fn valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            4 | 7 => *byte == b'-',
            _ => byte.is_ascii_digit(),
        })
}
