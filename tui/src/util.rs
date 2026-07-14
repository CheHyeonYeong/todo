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

/// 이번 주 월요일의 날짜 키
pub fn monday_key() -> String {
    use chrono::Datelike;
    let now = Local::now();
    let offset = now.weekday().num_days_from_monday() as i64;
    (now - chrono::Duration::days(offset)).format("%Y-%m-%d").to_string()
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
