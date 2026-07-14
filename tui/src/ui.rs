use crate::app::{App, Editor, Mode, Overlay};
use crate::model::{scope_label, Row, Session};
use crate::util::{date_key, days_from_today, format_duration, local_timestamp, today_key};
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

/// 카테고리마다 다른 색. 웹의 카테고리 색과 같은 방식(이름 해시)으로 고른다.
fn category_color(category: &str) -> Color {
    const PALETTE: [Color; 6] = [
        Color::Cyan,
        Color::Magenta,
        Color::Green,
        Color::Yellow,
        Color::Blue,
        Color::LightRed,
    ];
    let hash = category.chars().fold(0usize, |acc, ch| acc.wrapping_mul(31).wrapping_add(ch as usize));
    PALETTE[hash % PALETTE.len()]
}

/// 마감을 사람이 읽는 말로. 오늘/내일/3일 지남.
fn due_label(due: &str, done: bool) -> (String, Color) {
    let days = days_from_today(due);
    if done {
        return (due.to_string(), Color::DarkGray);
    }
    match days {
        d if d < 0 => (format!("{}일 지남", -d), Color::Red),
        0 => ("오늘".to_string(), Color::Yellow),
        1 => ("내일".to_string(), Color::DarkGray),
        d if d < 7 => (format!("{d}일 뒤"), Color::DarkGray),
        _ => (due.get(5..).unwrap_or(due).replace('-', "/"), Color::DarkGray),
    }
}

fn row_line<'a>(row: &Row, selected: bool, width: usize, filtered: bool) -> Line<'a> {
    let todo = &row.todo;
    let mark = if todo.done { "✓" } else { "○" };
    let tree = if row.depth > 0 {
        if row.last { "    └ " } else { "    ├ " }
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
    let repeat = if todo.routine_id.is_some() { " ↻" } else { "" };
    let category_tag = match (&todo.category, row.depth, filtered) {
        (Some(category), 0, false) => Some(category.clone()),
        _ => None,
    };
    let (due_text, due_color) = match &todo.due_date {
        Some(due) => {
            let (text, color) = due_label(due, todo.done);
            (format!("  {text}"), color)
        }
        None => (String::new(), Color::DarkGray),
    };

    let mark_width = UnicodeWidthStr::width(tree) + UnicodeWidthStr::width(mark) + 1;
    let tag_width = category_tag
        .as_deref()
        .map(|category| UnicodeWidthStr::width(category) + 3)
        .unwrap_or(0);
    let due_width = UnicodeWidthStr::width(due_text.as_str());
    let title_width = width
        .saturating_sub(mark_width + tag_width + due_width + 1)
        .max(4);

    let text_color = if todo.done {
        Color::DarkGray
    } else if row.depth > 0 {
        Color::Reset
    } else {
        Color::Reset
    };
    let mut spans = vec![Span::styled(
        format!("{tree}{mark} "),
        Style::new().fg(if todo.done { Color::Green } else { Color::DarkGray }),
    )];
    if let Some(category) = &category_tag {
        spans.push(Span::styled(
            format!("[{category}] "),
            Style::new().fg(category_color(category)),
        ));
    }
    spans.push(Span::styled(
        pad(&format!("{}{progress}{repeat}", todo.title), title_width),
        Style::new().fg(text_color),
    ));
    if !due_text.is_empty() {
        spans.push(Span::styled(due_text, Style::new().fg(due_color)));
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

/// ? 를 눌렀을 때만 뜨는 도움말. 평소 화면은 목록만 보여준다.
const HELP_KEYS: [(&str, &str); 19] = [
    ("i / a", "입력 모드 (뒤에 @0715 @내일 로 마감)"),
    ("Esc", "명령 모드"),
    ("j / k, ↑ ↓", "위아래 이동"),
    ("h / l", "하위 목표 접기 / 펼치기"),
    ("Space", "완료 전환"),
    ("s", "하위 목표 추가"),
    ("e", "제목 편집"),
    ("t", "마감 지정"),
    ("c", "카테고리 지정"),
    ("Tab / Shift+Tab", "카테고리 탭 전환"),
    ("Shift+↑ ↓", "순서 옮기기"),
    ("Shift+← →", "하위로 넣기 / 빼기"),
    ("d", "삭제"),
    ("u", "되돌리기"),
    ("p", "뽀모도로 타이머"),
    ("T", "오늘 타임테이블"),
    ("R", "루틴 (요일별 반복)"),
    ("m", "빠른 메모"),
    ("r / q", "새로고침 / 종료"),
];

/// 화면 가운데에 팝업 영역을 잡고 테두리를 그린다.
fn popup(frame: &mut Frame, area: ratatui::layout::Rect, title: &str, width: u16, height: u16) -> ratatui::layout::Rect {
    let width = width.min(area.width);
    let height = height.min(area.height);
    let rect = ratatui::layout::Rect {
        x: area.x + (area.width.saturating_sub(width)) / 2,
        y: area.y + (area.height.saturating_sub(height)) / 2,
        width,
        height,
    };
    frame.render_widget(ratatui::widgets::Clear, rect);
    let block = Block::bordered().title(format!(" {title} "));
    let inner = block.inner(rect);
    frame.render_widget(block, rect);
    inner
}

fn pomodoro_overlay(frame: &mut Frame, app: &App, area: ratatui::layout::Rect) {
    let running = app.timer.end_at.is_some();
    let inner = popup(frame, area, "뽀모도로 · Esc 닫기", 40, 8);
    let lines = vec![
        Line::from(""),
        Line::from(Span::styled(
            format!("        {}", app.timer.label()),
            Style::new()
                .fg(if running { Color::Green } else { Color::Reset })
                .bold(),
        )),
        Line::from(""),
        Line::from(Span::styled(
            if running {
                "  Enter/Space 정지".to_string()
            } else {
                format!("  Enter/Space 시작   +/- {}분", app.timer.minutes)
            },
            Style::new().fg(Color::DarkGray),
        )),
        Line::from(Span::styled(
            "  1분 이상이면 타임테이블에 기록",
            Style::new().fg(Color::DarkGray),
        )),
    ];
    frame.render_widget(Paragraph::new(lines), inner);
}

fn timetable_overlay(frame: &mut Frame, app: &App, area: ratatui::layout::Rect) {
    let today = today_key();
    let today_sessions: Vec<&Session> = app
        .sessions
        .iter()
        .filter(|session| date_key(&session.started_at) == today)
        .collect();
    let total: i64 = today_sessions
        .iter()
        .map(|session| crate::util::duration_ms(&session.started_at, &session.ended_at))
        .sum();

    let mut lines: Vec<Line> = Vec::new();
    if today_sessions.is_empty() {
        lines.push(Line::from(Span::styled(
            "오늘 기록이 없습니다. p 로 타이머를 돌려보세요.",
            Style::new().fg(Color::DarkGray),
        )));
    } else {
        for session in &today_sessions {
            let span = format!(
                "{} - {}",
                local_timestamp(&session.started_at, false),
                local_timestamp(&session.ended_at, false)
            );
            lines.push(Line::from(vec![
                Span::styled(pad(&span, 14), Style::new().fg(Color::DarkGray)),
                Span::raw("  "),
                Span::raw(session.label.clone()),
            ]));
        }
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            format!("합계 {}", format_duration(total)),
            Style::new().fg(Color::Green).bold(),
        )));
    }
    let height = (lines.len() as u16 + 2).min(area.height);
    let inner = popup(frame, area, "오늘 타임테이블 · 아무 키나 눌러 닫기", 56, height);
    frame.render_widget(Paragraph::new(lines), inner);
}

fn routines_overlay(frame: &mut Frame, app: &App, area: ratatui::layout::Rect) {
    const DAYS: [&str; 7] = ["일", "월", "화", "수", "목", "금", "토"];
    let mut lines: Vec<Line> = Vec::new();
    if app.routines.is_empty() {
        lines.push(Line::from(Span::styled(
            "루틴이 없습니다. n 으로 추가하세요.",
            Style::new().fg(Color::DarkGray),
        )));
    } else {
        for (index, routine) in app.routines.iter().enumerate() {
            let days: String = (0..7)
                .map(|day| {
                    if routine.weekdays.contains(&day) {
                        DAYS[day as usize].to_string()
                    } else {
                        "·".to_string()
                    }
                })
                .collect::<Vec<_>>()
                .join("");
            let title_color = if routine.active { Color::Reset } else { Color::DarkGray };
            let line = Line::from(vec![
                Span::styled(pad(&days, 14), Style::new().fg(Color::Cyan)),
                Span::raw(" "),
                Span::styled(pad(&routine.title, 20), Style::new().fg(title_color)),
                Span::styled(
                    if routine.active { "" } else { " (꺼짐)" },
                    Style::new().fg(Color::DarkGray),
                ),
            ]);
            lines.push(if index == app.routine_selected {
                line.style(Style::new().bg(Color::DarkGray))
            } else {
                line
            });
        }
    }
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "n 추가   1~7 요일(일~토)   Space 켜기/끄기   d 삭제   Esc 닫기",
        Style::new().fg(Color::DarkGray),
    )));
    let height = (lines.len() as u16 + 2).min(area.height);
    let inner = popup(frame, area, "루틴 · 정한 요일에 오늘 할 일로 들어갑니다", 64, height);
    frame.render_widget(Paragraph::new(lines), inner);
}

fn help_overlay(frame: &mut Frame, area: ratatui::layout::Rect) {
    let key_width = HELP_KEYS
        .iter()
        .map(|(key, _)| UnicodeWidthStr::width(*key))
        .max()
        .unwrap_or(0);
    let lines: Vec<Line> = HELP_KEYS
        .iter()
        .map(|(key, description)| {
            Line::from(vec![
                Span::styled(pad(key, key_width), Style::new().fg(Color::Cyan)),
                Span::raw("  "),
                Span::styled((*description).to_string(), Style::new().fg(Color::Reset)),
            ])
        })
        .collect();

    let width = (key_width + 44).min(area.width as usize) as u16;
    let height = (lines.len() as u16 + 2).min(area.height);
    let inner = popup(frame, area, "단축키 · 아무 키나 눌러 닫기", width, height);
    frame.render_widget(Paragraph::new(lines), inner);
}

/// 제목줄 요약: 남은 일과 지난 마감만. 나머지는 필요할 때 눌러서 본다.
fn summary(app: &App) -> String {
    let open = app
        .todos
        .iter()
        .filter(|todo| !todo.done && todo.parent_id.is_none())
        .count();
    let overdue = app
        .todos
        .iter()
        .filter(|todo| {
            !todo.done && todo.due_date.as_deref().map(|due| days_from_today(due) < 0).unwrap_or(false)
        })
        .count();
    let timer = match app.timer.end_at {
        Some(_) => format!("  ·  ⏱ {}", app.timer.label()),
        None => String::new(),
    };
    if overdue > 0 {
        format!(" To-Do  남은 일 {open}  ·  지난 마감 {overdue}{timer} ")
    } else {
        format!(" To-Do  남은 일 {open}{timer} ")
    }
}

pub fn render(frame: &mut Frame, app: &App) {
    let [list_area, input_area] =
        Layout::vertical([Constraint::Min(3), Constraint::Length(3)]).areas(frame.area());

    let mode_label = match (&app.prompt, &app.mode) {
        (Some(prompt), _) => prompt.label.clone(),
        (None, Mode::Insert) => "-- INSERT --".to_string(),
        (None, Mode::Normal) => "-- NORMAL --".to_string(),
    };
    let block = Block::bordered().title(format!("{} {mode_label} ", summary(app)));
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
        (None, Mode::Insert) => " 새 할 일 · @0715 로 마감 · Enter 추가 · Esc 명령모드 ".to_string(),
        (None, Mode::Normal) => " 명령 · ? 단축키 ".to_string(),
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
            let hint = if app.message.is_empty() {
                "i 입력   Space 완료   p 타이머   R 루틴   ? 단축키".to_string()
            } else {
                app.message.clone()
            };
            let mut spans = vec![Span::styled(hint, Style::new().fg(Color::DarkGray))];
            if app.sync.in_flight > 0 {
                spans.push(Span::styled(
                    format!("  ⟳ 저장 중 {}", app.sync.in_flight),
                    Style::new().fg(Color::Yellow),
                ));
            }
            frame.render_widget(Paragraph::new(Line::from(spans)), input_inner);
        }
    }

    match app.overlay {
        Overlay::None => {}
        Overlay::Help => help_overlay(frame, frame.area()),
        Overlay::Pomodoro => pomodoro_overlay(frame, app, frame.area()),
        Overlay::Timetable => timetable_overlay(frame, app, frame.area()),
        Overlay::Routines => routines_overlay(frame, app, frame.area()),
    }
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
