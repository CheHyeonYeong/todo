use crate::app::{App, Editor, Mode};
use crate::model::{scope_label, Row};
use crate::util::{days_from_today, local_timestamp};
use ratatui::layout::{Constraint, Layout, Position};
use ratatui::style::{Color, Style, Stylize};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Paragraph};
use ratatui::Frame;
use unicode_width::{UnicodeWidthChar, UnicodeWidthStr};

fn truncate(text: &str, width: usize) -> String {
    if UnicodeWidthStr::width(text) <= width {
        return text.to_string();
    }
    let mut result = String::new();
    let mut used = 0;
    for ch in text.chars() {
        let char_width = UnicodeWidthChar::width(ch).unwrap_or(0);
        if used + char_width + 1 > width {
            break;
        }
        result.push(ch);
        used += char_width;
    }
    result.push('…');
    result
}

fn pad(text: &str, width: usize) -> String {
    let clipped = truncate(text, width);
    let used = UnicodeWidthStr::width(clipped.as_str());
    format!("{clipped}{}", " ".repeat(width.saturating_sub(used)))
}

enum ListLine {
    Header(String),
    Item(usize),
}

fn row_line<'a>(row: &Row, selected: bool, width: usize, filtered: bool) -> Line<'a> {
    let todo = &row.todo;
    let mark = if todo.done { "[x]" } else { "[ ]" };
    let tree = if row.depth > 0 {
        if row.last { "     └ " } else { "     ├ " }
    } else if row.children_total > 0 {
        "▾ "
    } else {
        "  "
    };
    let progress = if row.children_total > 0 {
        format!(" ({}/{})", row.children_done, row.children_total)
    } else {
        String::new()
    };
    let category_tag = match (&todo.category, row.depth, filtered) {
        (Some(category), 0, false) => format!("[{category}] "),
        _ => String::new(),
    };
    let created = local_timestamp(&todo.created_at, width >= 46);
    let overdue_days = match &todo.due_date {
        Some(due) if !todo.done => -days_from_today(due),
        _ => 0,
    };
    // 마감은 폭에 상관없이 보여준다. 좁으면 "7/15", 넓으면 "⏳마감 2026-07-15 (3일 지남)".
    let due = match &todo.due_date {
        Some(due) => {
            let overdue_tag = if overdue_days > 0 && width >= 58 {
                format!(" ({overdue_days}일 지남)")
            } else {
                String::new()
            };
            if width >= 58 {
                format!("  ⏳마감 {due}{overdue_tag}")
            } else {
                let short = due.get(5..).unwrap_or(due).replace('-', "/");
                format!("  {}", short.trim_start_matches('0'))
            }
        }
        None => String::new(),
    };
    let metadata_width = UnicodeWidthStr::width(created.as_str()) + UnicodeWidthStr::width(due.as_str());
    let left_width = width.saturating_sub(metadata_width + 1).max(4);
    let left = pad(
        &format!("{tree}{mark} {category_tag}{}{progress}", todo.title),
        left_width,
    );
    let overdue = overdue_days > 0;
    let text_color = if todo.done {
        Color::DarkGray
    } else if row.depth > 0 {
        Color::Reset
    } else {
        Color::Cyan
    };
    let mut spans = vec![
        Span::styled(left, Style::new().fg(text_color)),
        Span::raw(" "),
        Span::styled(created, Style::new().fg(Color::DarkGray)),
    ];
    if !due.is_empty() {
        spans.push(Span::styled(
            due,
            Style::new().fg(if overdue { Color::Red } else { Color::DarkGray }),
        ));
    }
    let line = Line::from(spans);
    if selected {
        line.style(Style::new().bg(Color::DarkGray))
    } else {
        line
    }
}

fn tab_line<'a>(app: &App, width: usize) -> Line<'a> {
    let mut spans = Vec::new();
    let mut used = 0;
    let mut tabs: Vec<Option<String>> = vec![None];
    tabs.extend(app.categories().into_iter().map(Some));
    for tab in tabs {
        let label = format!(" {} ", tab.clone().unwrap_or_else(|| "전체".to_string()));
        let label_width = UnicodeWidthStr::width(label.as_str()) + 1;
        if used + label_width > width {
            break;
        }
        let active = tab == app.category;
        spans.push(Span::styled(
            label,
            if active {
                Style::new().bg(Color::DarkGray)
            } else {
                Style::new().fg(Color::DarkGray)
            },
        ));
        spans.push(Span::raw(" "));
        used += label_width;
    }
    let hint = "Tab 전환";
    let hint_width = UnicodeWidthStr::width(hint);
    if width > used + hint_width {
        spans.push(Span::raw(" ".repeat(width - used - hint_width)));
        spans.push(Span::styled(hint, Style::new().fg(Color::DarkGray)));
    }
    Line::from(spans)
}

/// 단축키 안내. 한 줄에 다 넣으면 잘리므로 터미널 폭에 맞춰 여러 줄로 채운다.
const HELP_ITEMS: [&str; 16] = [
    "i 입력",
    "Esc 명령모드",
    "j/k 이동",
    "h/l 접기",
    "Space 완료",
    "s 하위",
    "e 편집",
    "t 마감",
    "c 분류",
    "Tab 분류전환",
    "Shift+↑↓ 순서",
    "Shift+←→ 하위/상위",
    "d 삭제",
    "u 되돌림",
    "r 새로고침",
    "q 종료",
];
const HELP_GAP: &str = "  ";

fn help_lines(width: usize) -> Vec<String> {
    let gap = UnicodeWidthStr::width(HELP_GAP);
    let mut lines: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut used = 0;
    for item in HELP_ITEMS {
        let item_width = UnicodeWidthStr::width(item);
        let extra = if current.is_empty() { item_width } else { gap + item_width };
        if !current.is_empty() && used + extra > width {
            lines.push(std::mem::take(&mut current));
            used = 0;
        }
        if !current.is_empty() {
            current.push_str(HELP_GAP);
            used += gap;
        }
        current.push_str(item);
        used += item_width;
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

pub fn render(frame: &mut Frame, app: &App) {
    let help = help_lines(frame.area().width as usize);
    let [list_area, input_area, help_area] = Layout::vertical([
        Constraint::Min(3),
        Constraint::Length(3),
        Constraint::Length(help.len() as u16),
    ])
    .areas(frame.area());

    let root_count = app.todos.iter().filter(|todo| todo.parent_id.is_none()).count();
    let mode_label = match (&app.prompt, &app.mode) {
        (Some(prompt), _) => prompt.label.clone(),
        (None, Mode::Insert) => "-- INSERT --".to_string(),
        (None, Mode::Normal) => "-- NORMAL --".to_string(),
    };
    let block = Block::bordered().title(format!(" To-Do ({root_count}개)  {mode_label} "));
    let inner = block.inner(list_area);
    frame.render_widget(block, list_area);

    let categories = app.categories();
    let show_tabs = !categories.is_empty();
    let width = inner.width as usize;
    let (tabs_area, body_area) = if show_tabs {
        let [tabs, body] = Layout::vertical([Constraint::Length(1), Constraint::Min(1)]).areas(inner);
        (Some(tabs), body)
    } else {
        (None, inner)
    };
    if let Some(tabs_area) = tabs_area {
        frame.render_widget(Paragraph::new(tab_line(app, width)), tabs_area);
    }

    let rows = app.rows();
    let mut layout: Vec<ListLine> = Vec::new();
    let mut selected_line = 0;
    let mut last_scope = String::new();
    for (index, row) in rows.iter().enumerate() {
        if row.todo.scope != last_scope {
            last_scope = row.todo.scope.clone();
            layout.push(ListLine::Header(last_scope.clone()));
        }
        if index == app.selected {
            selected_line = layout.len();
        }
        layout.push(ListLine::Item(index));
    }

    let visible_height = body_area.height as usize;
    let mut start = selected_line.saturating_sub(visible_height / 2);
    start = start.min(layout.len().saturating_sub(visible_height));
    let mut lines: Vec<Line> = Vec::new();
    if rows.is_empty() {
        lines.push(Line::from(Span::styled(
            "할 일이 없습니다. 아래에서 바로 입력해 보세요.",
            Style::new().fg(Color::DarkGray),
        )));
    }
    for entry in layout.iter().skip(start).take(visible_height) {
        match entry {
            ListLine::Header(scope) => {
                let color = match scope.as_str() {
                    "day" => Color::Yellow,
                    "week" => Color::Green,
                    _ => Color::Cyan,
                };
                lines.push(Line::from(Span::styled(
                    format!("· {}", scope_label(scope)),
                    Style::new().fg(color).bold(),
                )));
            }
            ListLine::Item(index) => {
                lines.push(row_line(
                    &rows[*index],
                    *index == app.selected,
                    width,
                    app.category.is_some(),
                ));
            }
        }
    }
    frame.render_widget(Paragraph::new(lines), body_area);

    let input_title = match (&app.prompt, &app.mode) {
        (Some(prompt), _) => format!(" {} · Enter 저장 · Esc 취소 ", prompt.label),
        (None, Mode::Insert) => " 새 할 일 · 뒤에 @0715 @내일 로 마감 · Enter 추가 · Esc 명령모드 ".to_string(),
        (None, Mode::Normal) => " 명령 ".to_string(),
    };
    let input_block = Block::bordered().title(input_title);
    let input_inner = input_block.inner(input_area);
    frame.render_widget(input_block, input_area);

    let editor = app
        .prompt
        .as_ref()
        .map(|prompt| &prompt.editor)
        .or(if app.mode == Mode::Insert { Some(&app.input) } else { None });
    match editor {
        Some(editor) => {
            let (text, cursor_column) = editor_viewport(editor, input_inner.width.saturating_sub(1) as usize);
            frame.render_widget(Paragraph::new(text), input_inner);
            frame.set_cursor_position(Position {
                x: input_inner.x + cursor_column as u16,
                y: input_inner.y,
            });
        }
        None => {
            let mut spans = vec![Span::styled(app.message.clone(), Style::new().fg(Color::DarkGray))];
            if app.sync.in_flight > 0 {
                spans.push(Span::styled(
                    format!("  ⟳ 저장 중 {}", app.sync.in_flight),
                    Style::new().fg(Color::Yellow),
                ));
            }
            frame.render_widget(Paragraph::new(Line::from(spans)), input_inner);
        }
    }

    let help_text = help
        .into_iter()
        .map(|line| Line::from(Span::styled(line, Style::new().fg(Color::DarkGray))))
        .collect::<Vec<_>>();
    frame.render_widget(Paragraph::new(help_text), help_area);
}

fn editor_viewport(editor: &Editor, width: usize) -> (String, usize) {
    let chars = &editor.chars;
    let cursor = editor.cursor.min(chars.len());
    let mut start = 0;
    let slice_width = |from: usize, to: usize| -> usize {
        chars[from..to]
            .iter()
            .map(|ch| UnicodeWidthChar::width(*ch).unwrap_or(0))
            .sum()
    };
    while start < cursor && slice_width(start, cursor) >= width {
        start += 1;
    }
    let mut end = start;
    let mut used = 0;
    while end < chars.len() {
        let next = UnicodeWidthChar::width(chars[end]).unwrap_or(0);
        if used + next > width {
            break;
        }
        used += next;
        end += 1;
    }
    let text: String = chars[start..end].iter().collect();
    (text, slice_width(start, cursor))
}
