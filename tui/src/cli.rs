use crate::api::Client;
use crate::model::{extract_tags, extract_todos, flattened, scope_label, Todo};
use crate::util::color::{bold, cyan, dim, green, red, strike, yellow};
use crate::util::{
    date_key, format_duration, format_time, monday_key, month_end_key, new_uuid, now_iso, pad_label, today_key,
    duration_ms, week_end_key,
};
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub fn list(client: &mut Client, args: &[String]) -> Result<(), String> {
    let todos = client.fetch_todos()?;
    let flat = flattened(&todos);

    if args.iter().any(|arg| arg == "--json") {
        let numbered: Vec<Value> = flat
            .iter()
            .enumerate()
            .map(|(index, todo)| {
                let mut value = serde_json::to_value(todo).unwrap_or_else(|_| json!({}));
                if let Some(object) = value.as_object_mut() {
                    object.insert("number".to_string(), json!(index + 1));
                }
                value
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&numbered).unwrap_or_default());
        return Ok(());
    }

    if flat.is_empty() {
        println!("{}", dim("할 일이 없습니다. `todo add \"제목\"`으로 추가하세요."));
        return Ok(());
    }

    let mut current_scope = String::new();
    for (index, todo) in flat.iter().enumerate() {
        if todo.scope != current_scope {
            current_scope = todo.scope.clone();
            println!("\n{}", bold(&cyan(scope_label(&current_scope))));
        }
        let number = dim(&format!("{:>2}", index + 1));
        let mark = if todo.done { green("✓") } else { "○".to_string() };
        let title = if todo.done {
            dim(&strike(&todo.title))
        } else {
            todo.title.clone()
        };
        let category = todo
            .category
            .as_ref()
            .map(|name| cyan(&format!("[{name}] ")))
            .unwrap_or_default();
        let due = todo
            .due_date
            .as_ref()
            .map(|due| dim(&format!("  ~{due}")))
            .unwrap_or_default();
        let note = if todo.note.is_some() { dim(" ✎") } else { String::new() };
        let children: Vec<&Todo> = flat
            .iter()
            .filter(|item| item.parent_id.as_deref() == Some(&todo.id))
            .collect();
        let prefix = if todo.parent_id.is_some() {
            "    └ "
        } else if children.is_empty() {
            "  "
        } else {
            "▾ "
        };
        let progress = if children.is_empty() {
            String::new()
        } else {
            dim(&format!(
                " ({}/{})",
                children.iter().filter(|child| child.done).count(),
                children.len()
            ))
        };
        println!("{number} {prefix}{mark} {category}{title}{progress}{due}{note}");
    }
    println!();
    Ok(())
}

fn todo_by_number(client: &mut Client, number: usize) -> Result<(Vec<Todo>, Todo), String> {
    let todos = client.fetch_todos()?;
    let flat = flattened(&todos);
    let todo = flat
        .get(number.wrapping_sub(1))
        .cloned()
        .ok_or_else(|| format!("{number}번 할 일이 없습니다. `todo`로 번호를 확인하세요."))?;
    Ok((todos, todo))
}

fn record_undo(client: &mut Client, action: Value) {
    let mut action = action;
    action["at"] = json!(now_iso());
    client.set_session_field("lastAction", action);
}

pub fn add(client: &mut Client, args: &[String]) -> Result<(), String> {
    let scope = if args.iter().any(|arg| arg == "-m") {
        "month"
    } else if args.iter().any(|arg| arg == "-w") {
        "week"
    } else {
        "day"
    };
    let flag_value = |flag: &str| -> Option<String> {
        args.iter()
            .position(|arg| arg == flag)
            .and_then(|index| args.get(index + 1))
            .cloned()
    };
    let due_date = flag_value("-d");
    let category = flag_value("-c");
    let consumed: Vec<usize> = ["-d", "-c"]
        .iter()
        .filter_map(|flag| args.iter().position(|arg| arg == flag).map(|index| index + 1))
        .collect();
    let title = args
        .iter()
        .enumerate()
        .filter(|(index, arg)| !arg.starts_with('-') && !consumed.contains(index))
        .map(|(_, arg)| arg.as_str())
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();
    if title.is_empty() {
        return Err(
            "사용법: todo add \"제목\" [-w 이번주 | -m 이번달] [-d 2026-07-20] [-c 카테고리]".to_string(),
        );
    }
    if let Some(due) = &due_date {
        if !crate::model::valid_date(due) {
            return Err("마감일은 YYYY-MM-DD 형식으로 넣으세요.".to_string());
        }
    }
    // 마감일을 직접 안 주면 웹과 같은 정책: 오늘 / 이번 주 일요일 / 이번 달 말일.
    let due_date = due_date.or_else(|| {
        Some(match scope {
            "week" => week_end_key(),
            "month" => month_end_key(),
            _ => today_key(),
        })
    });

    let id = new_uuid();
    client.create_todo(&json!({
        "id": id,
        "title": title,
        "scope": scope,
        "done": false,
        "createdAt": now_iso(),
        "dueDate": due_date,
        "category": category,
    }))?;
    record_undo(client, json!({ "kind": "create", "id": id, "title": title }));
    let suffix = category.map(|name| dim(&format!(" [{name}]"))).unwrap_or_default();
    println!("{}{suffix}", green(&format!("추가됨 ({}): {title}", scope_label(scope))));
    Ok(())
}

pub fn toggle(client: &mut Client, number: usize) -> Result<(), String> {
    let (_, todo) = todo_by_number(client, number)?;
    let done = !todo.done;
    client.patch_todo(
        &todo.id,
        &json!({
            "done": done,
            "completedAt": if done { json!(now_iso()) } else { Value::Null },
        }),
    )?;
    record_undo(
        client,
        json!({
            "kind": "toggle",
            "id": todo.id,
            "title": todo.title,
            "done": todo.done,
            "completedAt": todo.completed_at,
        }),
    );
    println!(
        "{}",
        if done {
            green(&format!("완료: {}", todo.title))
        } else {
            yellow(&format!("다시 미완료로: {}", todo.title))
        }
    );
    Ok(())
}

pub fn remove(client: &mut Client, number: usize) -> Result<(), String> {
    let (todos, todo) = todo_by_number(client, number)?;
    let mut removed = vec![todo.clone()];
    removed.extend(
        todos
            .iter()
            .filter(|item| item.parent_id.as_deref() == Some(&todo.id))
            .cloned(),
    );
    client.delete_todo(&todo.id)?;
    let extra = if removed.len() > 1 {
        dim(&format!(
            " (하위 {}개 포함, `todo undo`로 복구)",
            removed.len() - 1
        ))
    } else {
        dim(" (`todo undo`로 복구)")
    };
    record_undo(client, json!({ "kind": "delete", "todos": removed }));
    println!("{}{extra}", yellow(&format!("삭제됨: {}", todo.title)));
    Ok(())
}

pub fn undo(client: &mut Client) -> Result<(), String> {
    let action = client.session().get("lastAction").cloned().unwrap_or(Value::Null);
    let kind = action.get("kind").and_then(Value::as_str).unwrap_or("");
    match kind {
        "create" => {
            let id = action["id"].as_str().unwrap_or_default().to_string();
            client.delete_todo(&id)?;
            println!(
                "{}",
                yellow(&format!("추가 취소: {}", action["title"].as_str().unwrap_or("")))
            );
        }
        "toggle" => {
            let id = action["id"].as_str().unwrap_or_default().to_string();
            let done = action["done"].as_bool().unwrap_or(false);
            let completed_at = if done {
                action
                    .get("completedAt")
                    .filter(|value| !value.is_null())
                    .cloned()
                    .unwrap_or_else(|| json!(now_iso()))
            } else {
                Value::Null
            };
            client.patch_todo(&id, &json!({ "done": done, "completedAt": completed_at }))?;
            println!(
                "{}",
                yellow(&format!(
                    "완료 상태 되돌림: {}",
                    action["title"].as_str().unwrap_or("")
                ))
            );
        }
        "delete" => {
            let todos: Vec<Todo> = serde_json::from_value(action["todos"].clone())
                .map_err(|error| format!("복구 데이터 파싱 실패: {error}"))?;
            let Some(first) = todos.first().cloned() else {
                return Err("복구할 항목이 없습니다.".to_string());
            };
            for todo in &todos {
                client.restore_todo(todo)?;
            }
            let extra = if todos.len() > 1 {
                dim(&format!(" (+하위 {}개)", todos.len() - 1))
            } else {
                String::new()
            };
            println!("{}{extra}", green(&format!("복구됨: {}", first.title)));
        }
        _ => return Err("되돌릴 작업이 없습니다. (add/done/rm 직후에만 가능)".to_string()),
    }
    client.set_session_field("lastAction", Value::Null);
    Ok(())
}

pub fn memo(client: &mut Client, body: &str) -> Result<(), String> {
    if body.trim().is_empty() {
        return Err("사용법: todo memo \"내용 #태그\"".to_string());
    }
    let created_at = now_iso();
    let memo_id = new_uuid();
    let todos: Vec<Value> = extract_todos(body)
        .into_iter()
        .map(|title| {
            json!({
                "id": new_uuid(),
                "title": title,
                "scope": "day",
                "done": false,
                "createdAt": created_at,
                "sourceMemoId": memo_id,
            })
        })
        .collect();
    let count = todos.len();
    client.create_memo(
        &json!({
            "id": memo_id,
            "body": body,
            "createdAt": created_at,
            "tags": extract_tags(body),
            "starred": false,
        }),
        &json!(todos),
    )?;
    let extra = if count > 0 {
        dim(&format!(" (+ 할 일 {count}개 추출)"))
    } else {
        String::new()
    };
    println!("{}{extra}", green("메모 저장됨"));
    Ok(())
}

pub fn memos(client: &mut Client, count: usize) -> Result<(), String> {
    let data = client.fetch_data()?;
    if data.memos.is_empty() {
        println!("{}", dim("메모가 없습니다."));
        return Ok(());
    }
    for memo in data.memos.iter().take(count) {
        let stamp = format!("{} {}", date_key(&memo.created_at), format_time(&memo.created_at));
        let star = if memo.starred { yellow("★ ") } else { String::new() };
        let first_line = memo.body.lines().next().unwrap_or("");
        println!("{}  {star}{first_line}", dim(&stamp));
    }
    Ok(())
}

pub fn log(client: &mut Client, args: &[String]) -> Result<(), String> {
    let data = client.fetch_data()?;

    if args.iter().any(|arg| arg == "--week") {
        let start = monday_key();
        let week: Vec<_> = data
            .sessions
            .iter()
            .filter(|session| date_key(&session.started_at) >= start)
            .collect();
        if week.is_empty() {
            println!("{}", dim("이번 주 기록이 없습니다."));
            return Ok(());
        }
        let mut totals: BTreeMap<String, i64> = BTreeMap::new();
        let mut total = 0;
        for session in week {
            let ms = duration_ms(&session.started_at, &session.ended_at);
            let label = if session.label.is_empty() {
                "이름 없는 작업".to_string()
            } else {
                session.label.clone()
            };
            *totals.entry(label).or_default() += ms;
            total += ms;
        }
        println!("{}", bold(&cyan("이번 주 타임테이블")));
        let mut rows: Vec<_> = totals.into_iter().collect();
        rows.sort_by(|a, b| b.1.cmp(&a.1));
        for (label, ms) in rows {
            println!("  {} {}", pad_label(&label, 20), green(&format_duration(ms)));
        }
        println!("{}", dim(&format!("  합계 {}", format_duration(total))));
        return Ok(());
    }

    let today = today_key();
    let mut today_sessions: Vec<_> = data
        .sessions
        .iter()
        .filter(|session| date_key(&session.started_at) == today)
        .collect();
    today_sessions.sort_by(|a, b| a.started_at.cmp(&b.started_at));
    if today_sessions.is_empty() {
        println!(
            "{}",
            dim("오늘 기록이 없습니다. `todo track \"작업명\"`으로 시작하세요.")
        );
        return Ok(());
    }
    println!("{}", bold(&cyan("오늘 타임테이블")));
    let mut total = 0;
    for session in today_sessions {
        let ms = duration_ms(&session.started_at, &session.ended_at);
        total += ms;
        let label = if session.label.is_empty() {
            "이름 없는 작업".to_string()
        } else {
            session.label.clone()
        };
        println!(
            "  {} – {}  {} {}",
            format_time(&session.started_at),
            format_time(&session.ended_at),
            pad_label(&label, 20),
            dim(&format_duration(ms))
        );
    }
    println!("{}", dim(&format!("  합계 {}", format_duration(total))));
    Ok(())
}

pub fn track(client: &mut Client, label: &str) -> Result<(), String> {
    if let Some(tracking) = client.session().get("tracking").cloned().filter(|v| !v.is_null()) {
        return Err(format!(
            "이미 기록 중입니다: \"{}\" ({}~). 먼저 `todo stop`.",
            tracking["label"].as_str().unwrap_or(""),
            format_time(tracking["startedAt"].as_str().unwrap_or(""))
        ));
    }
    let started_at = now_iso();
    let label = label.trim().to_string();
    client.set_session_field(
        "tracking",
        json!({ "id": new_uuid(), "label": label, "startedAt": started_at }),
    );
    let display = if label.is_empty() { "이름 없는 작업" } else { &label };
    println!(
        "{}",
        green(&format!("기록 시작: {display} ({})", format_time(&started_at)))
    );
    Ok(())
}

pub fn stop(client: &mut Client) -> Result<(), String> {
    let tracking = client
        .session()
        .get("tracking")
        .cloned()
        .filter(|value| !value.is_null())
        .ok_or("기록 중인 작업이 없습니다. `todo track \"작업명\"`으로 시작하세요.")?;
    let mut finished = tracking.clone();
    finished["endedAt"] = json!(now_iso());
    client.create_session(&finished)?;
    client.set_session_field("tracking", Value::Null);
    let ms = duration_ms(
        finished["startedAt"].as_str().unwrap_or(""),
        finished["endedAt"].as_str().unwrap_or(""),
    );
    let label = finished["label"].as_str().unwrap_or("");
    let display = if label.is_empty() { "이름 없는 작업" } else { label };
    println!(
        "{}",
        green(&format!("기록 종료: {display} · {}", format_duration(ms)))
    );
    Ok(())
}

pub fn status(client: &Client) {
    let session = client.session();
    match session.get("email").and_then(Value::as_str) {
        Some(email) => println!("계정: {}", green(email)),
        None => println!("계정: {}", dim("로그인 안 됨 (todo login)")),
    }
    match session.get("tracking").filter(|value| !value.is_null()) {
        Some(tracking) => {
            let started_at = tracking["startedAt"].as_str().unwrap_or("");
            let ms = duration_ms(started_at, &now_iso());
            let label = tracking["label"].as_str().unwrap_or("");
            let display = if label.is_empty() { "이름 없는 작업" } else { label };
            println!(
                "기록 중: {} · {} 경과",
                yellow(display),
                format_duration(ms)
            );
        }
        None => println!("{}", dim("기록 중인 작업 없음")),
    }
}

pub fn help() {
    println!(
        "{} — Todo 터미널 클라이언트

  todo                     Vim 스타일 대화형 TUI (비대화형 터미널에서는 목록)
  todo list [--json]       할 일 목록 (번호 포함, --json은 스크립트/AI용 JSON 출력)
  todo add \"제목\" [옵션]    할 일 추가  (-w 이번주, -m 이번달, -d 2026-07-20 마감일, -c 카테고리)
  todo done <번호>          완료 토글 (toggle 도 같음)
  todo rm <번호>            삭제 (하위 포함)
  todo undo                마지막 add/done/rm 되돌리기
  todo memo \"내용 #태그\"    메모 기록 (- [ ] 줄은 할 일로 자동 추출)
  todo memos [개수]         최근 메모 (기본 10개)
  todo log [--week]        오늘 타임테이블 / 이번 주 작업별 합계
  todo track \"작업명\"       시간 기록 시작
  todo stop                시간 기록 종료 (서버에 저장)
  todo status              로그인/기록 상태
  todo login / logout      Google 로그인 / 로그아웃",
        bold("todo")
    );
}

pub fn fail(message: &str) -> ! {
    eprintln!("{}", red(message));
    std::process::exit(1);
}
