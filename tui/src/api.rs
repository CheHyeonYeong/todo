use crate::model::{Data, OrderItem, Todo};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Duration;

const DEFAULT_API_BASE: &str = "https://158-179-193-175.nip.io";
const DEFAULT_SUPABASE_URL: &str = "https://mkvgbffihswfjzgegwlx.supabase.co";
const DEFAULT_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rdmdiZmZpaHN3Zmp6Z2Vnd2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NzA5NzksImV4cCI6MjA5ODU0Njk3OX0.MrKmcsAMCU9fepyD97HMuSSImARjtchiCAaGRzgqsQ8";

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key)
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_string())
        .trim_end_matches('/')
        .to_string()
}

pub struct Client {
    base: String,
    pub supabase: String,
    pub anon_key: String,
    session_path: PathBuf,
    /// 세션 파일에는 토큰 외에 tracking / lastAction 같은 상태도 함께 들어간다.
    session: Value,
    agent: ureq::Agent,
}

impl Client {
    pub fn new() -> Self {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let session_path = home.join(".config").join("todo").join("session.json");
        let session = read_json(&session_path).unwrap_or_else(|| json!({}));
        Client {
            base: env_or("TODO_API_BASE", DEFAULT_API_BASE),
            supabase: env_or("TODO_SUPABASE_URL", DEFAULT_SUPABASE_URL),
            anon_key: env_or("TODO_SUPABASE_ANON_KEY", DEFAULT_ANON_KEY),
            session_path,
            session,
            agent: ureq::AgentBuilder::new().timeout(Duration::from_secs(20)).build(),
        }
    }

    pub fn session(&self) -> &Value {
        &self.session
    }

    pub fn set_session_field(&mut self, key: &str, value: Value) {
        if value.is_null() {
            if let Some(object) = self.session.as_object_mut() {
                object.remove(key);
            }
        } else {
            self.session[key] = value;
        }
        self.save_session();
    }

    pub fn logout(&mut self) {
        let _ = std::fs::remove_file(&self.session_path);
        self.session = json!({});
    }

    pub fn store_tokens(&mut self, tokens: &Value) {
        let expires_in = tokens.get("expires_in").and_then(Value::as_f64).unwrap_or(3600.0);
        let now_ms = chrono::Utc::now().timestamp_millis() as f64;
        self.session["access_token"] = tokens.get("access_token").cloned().unwrap_or(Value::Null);
        self.session["refresh_token"] = tokens.get("refresh_token").cloned().unwrap_or(Value::Null);
        self.session["expires_at"] = json!(now_ms + expires_in * 1000.0);
        if let Some(email) = tokens.pointer("/user/email") {
            self.session["email"] = email.clone();
        }
        self.save_session();
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
        self.session.get(key).and_then(Value::as_str).map(str::to_string)
    }

    pub fn supabase_post(&self, path: &str, body: Value) -> Result<Value, String> {
        let url = format!("{}{}", self.supabase, path);
        self.agent
            .post(&url)
            .set("apikey", &self.anon_key)
            .set("Content-Type", "application/json")
            .send_json(body)
            .map_err(|error| match error {
                ureq::Error::Status(code, response) => {
                    format!("({code}) {}", response.into_string().unwrap_or_default())
                }
                error => error.to_string(),
            })?
            .into_json::<Value>()
            .map_err(|error| format!("응답 파싱 실패: {error}"))
    }

    fn refresh(&mut self) -> bool {
        let Some(refresh_token) = self.token("refresh_token") else {
            return false;
        };
        let Ok(tokens) = self.supabase_post(
            "/auth/v1/token?grant_type=refresh_token",
            json!({ "refresh_token": refresh_token }),
        ) else {
            return false;
        };
        if tokens.get("access_token").and_then(Value::as_str).is_none() {
            return false;
        }
        self.store_tokens(&tokens);
        true
    }

    fn request(&mut self, method: &str, path: &str, body: Option<&Value>) -> Result<Value, String> {
        if let Some(expires_at) = self.session.get("expires_at").and_then(Value::as_f64) {
            if chrono::Utc::now().timestamp_millis() as f64 > expires_at - 60_000.0 {
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
                        .map_err(|error| format!("응답 파싱 실패: {error}"))
                }
                Err(ureq::Error::Status(401, _)) if attempt == 0 && self.refresh() => continue,
                Err(ureq::Error::Status(401, _)) => {
                    return Err("로그인이 필요합니다. 먼저 `todo login`을 실행하세요.".to_string())
                }
                Err(ureq::Error::Status(code, response)) => {
                    return Err(format!(
                        "API 오류 ({code}): {}",
                        response.into_string().unwrap_or_default()
                    ))
                }
                Err(error) => return Err(format!("서버에 연결할 수 없습니다: {} ({error})", self.base)),
            }
        }
        Err("요청 실패".to_string())
    }

    pub fn fetch_data(&mut self) -> Result<Data, String> {
        let data = self.request("GET", "/api/data", None)?;
        serde_json::from_value(data).map_err(|error| format!("데이터 파싱 실패: {error}"))
    }

    pub fn fetch_todos(&mut self) -> Result<Vec<Todo>, String> {
        Ok(self.fetch_data()?.todos)
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
        self.request("PUT", "/api/todos/order", Some(&json!({ "items": items })))
            .map(|_| ())
    }

    pub fn create_memo(&mut self, memo: &Value, todos: &Value) -> Result<(), String> {
        self.request("POST", "/api/memos", Some(&json!({ "memo": memo, "todos": todos })))
            .map(|_| ())
    }

    pub fn create_session(&mut self, session: &Value) -> Result<(), String> {
        self.request("POST", "/api/sessions", Some(session)).map(|_| ())
    }

    pub fn create_routine(&mut self, routine: &Value) -> Result<(), String> {
        self.request("POST", "/api/routines", Some(routine)).map(|_| ())
    }

    pub fn patch_routine(&mut self, id: &str, patch: &Value) -> Result<(), String> {
        self.request("PATCH", &format!("/api/routines/{}", urlencode(id)), Some(patch))
            .map(|_| ())
    }

    pub fn delete_routine(&mut self, id: &str) -> Result<(), String> {
        self.request("DELETE", &format!("/api/routines/{}", urlencode(id)), None)
            .map(|_| ())
    }
}

fn read_json(path: &PathBuf) -> Option<Value> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
}

fn urlencode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (byte as char).to_string(),
            _ => format!("%{byte:02X}"),
        })
        .collect()
}
