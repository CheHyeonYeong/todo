use crate::model::{OrderItem, Todo};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Duration;

const DEFAULT_API_BASE: &str = "https://158-179-193-175.nip.io";
const DEFAULT_SUPABASE_URL: &str = "https://mkvgbffihswfjzgegwlx.supabase.co";
const DEFAULT_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rdmdiZmZpaHN3Zmp6Z2Vnd2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NzA5NzksImV4cCI6MjA5ODU0Njk3OX0.MrKmcsAMCU9fepyD97HMuSSImARjtchiCAaGRzgqsQ8";

fn env_or(keys: &[&str], fallback: &str) -> String {
    keys.iter()
        .find_map(|key| std::env::var(key).ok().filter(|value| !value.is_empty()))
        .unwrap_or_else(|| fallback.to_string())
        .trim_end_matches('/')
        .to_string()
}

pub struct Client {
    base: String,
    supabase: String,
    anon_key: String,
    session_path: PathBuf,
    // JS CLI와 같은 파일을 공유하므로 모르는 키(tracking, lastAction)를 보존해야 한다.
    session: Value,
    agent: ureq::Agent,
}

impl Client {
    pub fn new() -> Self {
        let config_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".config")
            .join("todo");
        let session_path = config_dir.join("session.json");
        let session = std::fs::read_to_string(&session_path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_else(|| json!({}));
        Client {
            base: env_or(&["TODO_API_BASE", "ADHD_API_BASE"], DEFAULT_API_BASE),
            supabase: env_or(&["TODO_SUPABASE_URL", "ADHD_SUPABASE_URL"], DEFAULT_SUPABASE_URL),
            anon_key: env_or(&["TODO_SUPABASE_ANON_KEY", "ADHD_SUPABASE_ANON_KEY"], DEFAULT_ANON_KEY),
            session_path,
            session,
            agent: ureq::AgentBuilder::new()
                .timeout(Duration::from_secs(15))
                .build(),
        }
    }

    fn save_session(&self) {
        if let Some(parent) = self.session_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(text) = serde_json::to_string_pretty(&self.session) {
            let _ = std::fs::write(&self.session_path, format!("{text}\n"));
        }
    }

    fn token(&self, key: &str) -> Option<String> {
        self.session
            .get(key)
            .and_then(Value::as_str)
            .map(str::to_string)
    }

    fn refresh(&mut self) -> bool {
        let Some(refresh_token) = self.token("refresh_token") else {
            return false;
        };
        let url = format!("{}/auth/v1/token?grant_type=refresh_token", self.supabase);
        let response = self
            .agent
            .post(&url)
            .set("apikey", &self.anon_key)
            .set("Content-Type", "application/json")
            .send_json(json!({ "refresh_token": refresh_token }));
        let Ok(response) = response else { return false };
        let Ok(tokens) = response.into_json::<Value>() else {
            return false;
        };
        let (Some(access), Some(refresh)) = (
            tokens.get("access_token").and_then(Value::as_str),
            tokens.get("refresh_token").and_then(Value::as_str),
        ) else {
            return false;
        };
        let expires_in = tokens.get("expires_in").and_then(Value::as_f64).unwrap_or(3600.0);
        let now_ms = chrono::Utc::now().timestamp_millis() as f64;
        self.session["access_token"] = json!(access);
        self.session["refresh_token"] = json!(refresh);
        self.session["expires_at"] = json!(now_ms + expires_in * 1000.0);
        if let Some(email) = tokens.pointer("/user/email").and_then(Value::as_str) {
            self.session["email"] = json!(email);
        }
        self.save_session();
        true
    }

    fn request(&mut self, method: &str, path: &str, body: Option<&Value>) -> Result<Value, String> {
        let expires_at = self.session.get("expires_at").and_then(Value::as_f64);
        if let Some(expires_at) = expires_at {
            let now_ms = chrono::Utc::now().timestamp_millis() as f64;
            if now_ms > expires_at - 60_000.0 {
                self.refresh();
            }
        }
        for attempt in 0..2 {
            let url = format!("{}{}", self.base, path);
            let mut request = self.agent.request(method, &url);
            if let Some(token) = self.token("access_token") {
                request = request.set("Authorization", &format!("Bearer {token}"));
            }
            let response = match body {
                Some(value) => request.send_json(value.clone()),
                None => request.call(),
            };
            match response {
                Ok(response) => {
                    return response
                        .into_json::<Value>()
                        .map_err(|error| format!("응답 파싱 실패: {error}"));
                }
                Err(ureq::Error::Status(401, _)) if attempt == 0 && self.refresh() => continue,
                Err(ureq::Error::Status(401, _)) => {
                    return Err("로그인이 필요합니다. 먼저 `todo login`을 실행하세요.".to_string())
                }
                Err(ureq::Error::Status(code, response)) => {
                    let detail = response.into_string().unwrap_or_default();
                    return Err(format!("API 오류 ({code}): {detail}"));
                }
                Err(error) => return Err(format!("서버에 연결할 수 없습니다: {error}")),
            }
        }
        Err("요청 실패".to_string())
    }

    pub fn fetch_todos(&mut self) -> Result<Vec<Todo>, String> {
        let data = self.request("GET", "/api/data", None)?;
        let todos = data.get("todos").cloned().unwrap_or_else(|| json!([]));
        serde_json::from_value(todos).map_err(|error| format!("데이터 파싱 실패: {error}"))
    }

    pub fn create_todo(&mut self, todo: &Value) -> Result<Value, String> {
        self.request("POST", "/api/todos", Some(todo))
    }

    pub fn restore_todo(&mut self, todo: &Todo) -> Result<(), String> {
        let value = serde_json::to_value(todo).map_err(|error| error.to_string())?;
        self.request("POST", "/api/todos", Some(&value)).map(|_| ())
    }

    pub fn patch_todo(&mut self, id: &str, patch: &Value) -> Result<(), String> {
        self.request("PATCH", &format!("/api/todos/{}", urlencode(id)), Some(patch))
            .map(|_| ())
    }

    pub fn delete_todo(&mut self, id: &str) -> Result<(), String> {
        self.request("DELETE", &format!("/api/todos/{}", urlencode(id)), None)
            .map(|_| ())
    }

    pub fn reorder(&mut self, items: &[OrderItem]) -> Result<(), String> {
        let body = json!({ "items": items });
        self.request("PUT", "/api/todos/order", Some(&body)).map(|_| ())
    }
}

fn urlencode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}
