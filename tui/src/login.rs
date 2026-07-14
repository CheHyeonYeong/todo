use crate::api::Client;
use crate::util::random_bytes;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::process::{Command, Stdio};

const CALLBACK_PORT: u16 = 8787;

pub fn login(client: &mut Client) -> Result<(), String> {
    let verifier = URL_SAFE_NO_PAD.encode(random_bytes::<32>());
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let redirect = format!("http://localhost:{CALLBACK_PORT}");
    let authorize_url = format!(
        "{}/auth/v1/authorize?provider=google&redirect_to={}&code_challenge={challenge}&code_challenge_method=s256",
        client.supabase,
        urlencode(&redirect),
    );

    let listener = TcpListener::bind(("127.0.0.1", CALLBACK_PORT))
        .map_err(|error| format!("localhost:{CALLBACK_PORT} 를 열 수 없습니다: {error}"))?;

    println!("브라우저에서 Google 로그인을 완료하세요.");
    println!("브라우저가 안 열리면 직접 여세요:\n{authorize_url}\n");
    open_browser(&authorize_url);

    let code = wait_for_code(&listener)?;
    let tokens = client
        .supabase_post(
            "/auth/v1/token?grant_type=pkce",
            json!({ "auth_code": code, "code_verifier": verifier }),
        )
        .map_err(|error| format!("토큰 교환 실패: {error}"))?;
    if tokens.get("access_token").is_none() {
        return Err(format!("토큰 교환 실패: {tokens}"));
    }
    client.store_tokens(&tokens);
    let email = tokens
        .pointer("/user/email")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    println!("로그인 완료: {email}");
    Ok(())
}

fn wait_for_code(listener: &TcpListener) -> Result<String, String> {
    // Supabase가 redirect_to로 되돌려 보내는 첫 요청에서 ?code= 를 꺼낸다.
    for stream in listener.incoming() {
        let mut stream = stream.map_err(|error| error.to_string())?;
        let mut request_line = String::new();
        BufReader::new(&stream)
            .read_line(&mut request_line)
            .map_err(|error| error.to_string())?;
        let _ = stream.write_all(
            b"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
              <h2>\xeb\xa1\x9c\xea\xb7\xb8\xec\x9d\xb8 \xec\xb2\x98\xeb\xa6\xac \xec\x99\x84\xeb\xa3\x8c. \
              \xed\x84\xb0\xeb\xaf\xb8\xeb\x84\x90\xeb\xa1\x9c \xeb\x8f\x8c\xec\x95\x84\xea\xb0\x80\xec\x84\xb8\xec\x9a\x94.</h2>",
        );
        let Some(target) = request_line.split_whitespace().nth(1) else {
            continue;
        };
        let query = target.split_once('?').map(|(_, query)| query).unwrap_or("");
        let mut error_description = None;
        for pair in query.split('&') {
            match pair.split_once('=') {
                Some(("code", value)) if !value.is_empty() => return Ok(urldecode(value)),
                Some(("error_description", value)) => error_description = Some(urldecode(value)),
                _ => {}
            }
        }
        if let Some(description) = error_description {
            return Err(format!("로그인 실패: {description}"));
        }
    }
    Err("로그인 실패: 콜백을 받지 못했습니다.".to_string())
}

fn open_browser(url: &str) {
    let candidates: Vec<Vec<&str>> = if cfg!(target_os = "windows") {
        vec![vec!["rundll32", "url.dll,FileProtocolHandler", url]]
    } else if cfg!(target_os = "macos") {
        vec![vec!["open", url]]
    } else {
        vec![vec!["xdg-open", url], vec!["wslview", url], vec!["explorer.exe", url]]
    };
    for candidate in candidates {
        let (command, args) = candidate.split_first().expect("빈 후보 없음");
        if Command::new(command)
            .args(args)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .is_ok()
        {
            return;
        }
    }
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

fn urldecode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(byte) => {
                        out.push(byte);
                        index += 3;
                    }
                    Err(_) => {
                        out.push(bytes[index]);
                        index += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}
