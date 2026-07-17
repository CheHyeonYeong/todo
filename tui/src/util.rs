use chrono::{DateTime, Local};

pub fn random_bytes<const N: usize>() -> [u8; N] {
    let mut buffer = [0u8; N];
    if std::fs::File::open("/dev/urandom")
        .and_then(|mut file| std::io::Read::read_exact(&mut file, &mut buffer))
        .is_ok()
    {
        return buffer;
    }
    let mut seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    for byte in buffer.iter_mut() {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        *byte = (seed >> 33) as u8;
    }
    buffer
}

pub fn new_uuid() -> String {
    let mut bytes = random_bytes::<16>();
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn local(value: &str) -> Option<DateTime<Local>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|parsed| parsed.with_timezone(&Local))
}

pub fn format_time(value: &str) -> String {
    local(value).map(|time| time.format("%H:%M").to_string()).unwrap_or_default()
}

pub fn local_timestamp(value: &str, full: bool) -> String {
    let Some(time) = local(value) else { return String::new() };
    if full {
        time.format("%Y-%m-%d %H:%M").to_string()
    } else {
        time.format("%H:%M").to_string()
    }
}

pub fn date_key(value: &str) -> String {
    local(value).map(|time| time.format("%Y-%m-%d").to_string()).unwrap_or_default()
}

pub fn today_key() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// 오늘부터 며칠 뒤/전인지. 음수면 지난 날짜.
pub fn days_from_today(key: &str) -> i64 {
    let Ok(date) = chrono::NaiveDate::parse_from_str(key, "%Y-%m-%d") else {
        return 0;
    };
    (date - Local::now().date_naive()).num_days()
}

/// 새 할 일 입력줄의 마감 접미사를 떼어낸다: "보고서 @0715" -> ("보고서", Some("2026-07-15"))
/// @오늘 @내일 @모레 @MMDD @YYYY-MM-DD 를 받는다. 해석 못 하면 접미사를 제목에 그대로 남긴다.
pub fn split_due_suffix(input: &str) -> (String, Option<String>) {
    let trimmed = input.trim();
    let Some((title, token)) = trimmed.rsplit_once('@') else {
        return (trimmed.to_string(), None);
    };
    let token = token.trim();
    let Some(due) = parse_due_token(token) else {
        return (trimmed.to_string(), None);
    };
    (title.trim().to_string(), Some(due))
}

fn parse_due_token(token: &str) -> Option<String> {
    let today = Local::now().date_naive();
    let shift = |days: i64| Some((today + chrono::Duration::days(days)).format("%Y-%m-%d").to_string());
    match token {
        "오늘" | "today" => return shift(0),
        "내일" | "tomorrow" => return shift(1),
        "모레" => return shift(2),
        _ => {}
    }
    if token.len() == 4 && token.chars().all(|ch| ch.is_ascii_digit()) {
        let month: u32 = token[0..2].parse().ok()?;
        let day: u32 = token[2..4].parse().ok()?;
        use chrono::Datelike;
        return chrono::NaiveDate::from_ymd_opt(today.year(), month, day)
            .map(|date| date.format("%Y-%m-%d").to_string());
    }
    chrono::NaiveDate::parse_from_str(token, "%Y-%m-%d")
        .ok()
        .map(|date| date.format("%Y-%m-%d").to_string())
}

/// 루틴 입력의 요일 접미사를 떼어낸다: "필라테스 월수금" -> ("필라테스", [1,3,5])
/// "매일"/"평일"도 받는다. 요일을 안 적으면 매일로 본다. (0=일 ~ 6=토)
pub fn split_weekdays(input: &str) -> (String, Vec<u8>) {
    const EVERYDAY: [u8; 7] = [0, 1, 2, 3, 4, 5, 6];
    let trimmed = input.trim();
    let Some((title, token)) = trimmed.rsplit_once(' ') else {
        return (trimmed.to_string(), EVERYDAY.to_vec());
    };
    let token = token.trim();
    let weekdays = match token {
        "매일" => EVERYDAY.to_vec(),
        "평일" => vec![1, 2, 3, 4, 5],
        "주말" => vec![0, 6],
        _ => {
            let parsed: Vec<u8> = token
                .chars()
                .filter_map(|ch| match ch {
                    '일' => Some(0),
                    '월' => Some(1),
                    '화' => Some(2),
                    '수' => Some(3),
                    '목' => Some(4),
                    '금' => Some(5),
                    '토' => Some(6),
                    _ => None,
                })
                .collect();
            // 요일 글자만으로 이루어진 토큰일 때만 요일로 인정한다("보고서 쓰기"의 '쓰기'는 아님).
            if parsed.len() != token.chars().count() || parsed.is_empty() {
                return (trimmed.to_string(), EVERYDAY.to_vec());
            }
            parsed
        }
    };
    let mut weekdays = weekdays;
    weekdays.sort_unstable();
    weekdays.dedup();
    (title.trim().to_string(), weekdays)
}

/// 이번 주 월요일의 날짜 키
pub fn monday_key() -> String {
    use chrono::Datelike;
    let now = Local::now();
    let offset = now.weekday().num_days_from_monday() as i64;
    (now - chrono::Duration::days(offset)).format("%Y-%m-%d").to_string()
}

/// 이번 주 일요일(주의 끝)의 날짜 키
pub fn week_end_key() -> String {
    use chrono::Datelike;
    let now = Local::now();
    let offset = 6 - now.weekday().num_days_from_monday() as i64;
    (now + chrono::Duration::days(offset)).format("%Y-%m-%d").to_string()
}

/// 이번 달 마지막 날의 날짜 키
pub fn month_end_key() -> String {
    use chrono::Datelike;
    let now = Local::now();
    let (year, month) = if now.month() == 12 { (now.year() + 1, 1) } else { (now.year(), now.month() + 1) };
    let last = chrono::NaiveDate::from_ymd_opt(year, month, 1)
        .and_then(|first| first.pred_opt())
        .unwrap_or_else(|| now.date_naive());
    last.format("%Y-%m-%d").to_string()
}

pub fn duration_ms(started_at: &str, ended_at: &str) -> i64 {
    match (local(started_at), local(ended_at)) {
        (Some(start), Some(end)) => (end - start).num_milliseconds().max(0),
        _ => 0,
    }
}

pub fn format_duration(ms: i64) -> String {
    let minutes = (ms as f64 / 60_000.0).round() as i64;
    if minutes < 1 {
        return "1분 미만".to_string();
    }
    let hours = minutes / 60;
    let rest = minutes % 60;
    match (hours, rest) {
        (0, rest) => format!("{rest}분"),
        (hours, 0) => format!("{hours}시간"),
        (hours, rest) => format!("{hours}시간 {rest}분"),
    }
}

pub fn pad_label(text: &str, width: usize) -> String {
    let used = unicode_width::UnicodeWidthStr::width(text);
    format!("{text}{}", " ".repeat(width.saturating_sub(used)))
}

pub mod color {
    pub fn bold(text: &str) -> String {
        format!("\x1b[1m{text}\x1b[0m")
    }
    pub fn dim(text: &str) -> String {
        format!("\x1b[2m{text}\x1b[0m")
    }
    pub fn strike(text: &str) -> String {
        format!("\x1b[9m{text}\x1b[0m")
    }
    pub fn green(text: &str) -> String {
        format!("\x1b[32m{text}\x1b[0m")
    }
    pub fn yellow(text: &str) -> String {
        format!("\x1b[33m{text}\x1b[0m")
    }
    pub fn red(text: &str) -> String {
        format!("\x1b[31m{text}\x1b[0m")
    }
    pub fn cyan(text: &str) -> String {
        format!("\x1b[36m{text}\x1b[0m")
    }
}
