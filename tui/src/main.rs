mod api;
mod app;
mod cli;
mod local;
mod login;
mod model;
mod sync;
mod ui;
mod util;

use api::Client;
use cli::fail;
use std::io::IsTerminal;

fn number_arg(args: &[String], usage: &str) -> usize {
    args.first()
        .and_then(|arg| arg.parse::<usize>().ok())
        .filter(|number| *number > 0)
        .unwrap_or_else(|| fail(usage))
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let (command, args) = argv.split_first().map(|(head, rest)| (head.as_str(), rest)).unwrap_or(("", &[]));
    let mut client = Client::new();

    let result = match command {
        "" => {
            // 파이프로 넘길 때는 TUI 대신 목록을 뿌린다.
            if std::io::stdin().is_terminal() && std::io::stdout().is_terminal() {
                app::run(client)
            } else {
                cli::list(&mut client, &[])
            }
        }
        "list" => cli::list(&mut client, args),
        "add" => cli::add(&mut client, args),
        "done" | "toggle" => {
            let number = number_arg(args, &format!("사용법: todo {command} <번호>"));
            cli::toggle(&mut client, number)
        }
        "rm" => {
            let number = number_arg(args, "사용법: todo rm <번호>");
            cli::remove(&mut client, number)
        }
        "undo" => cli::undo(&mut client),
        "memo" => cli::memo(&mut client, &args.join(" ")),
        "memos" => {
            let count = args.first().and_then(|arg| arg.parse().ok()).unwrap_or(10);
            cli::memos(&mut client, count)
        }
        "log" => cli::log(&mut client, args),
        "track" => {
            let label = args.join(" ");
            if label.trim().is_empty() {
                fail("사용법: todo track \"작업명\"");
            }
            cli::track(&mut client, &label)
        }
        "stop" => cli::stop(&mut client),
        "status" => {
            cli::status(&client);
            Ok(())
        }
        "open" => {
            let url = std::env::var("TODO_WEB_URL")
                .unwrap_or_else(|_| "https://158-179-193-175.nip.io".to_string());
            login::open_browser(&url);
            println!("웹 화면을 열었습니다: {url}");
            Ok(())
        }
        "login" => login::login(&mut client),
        "logout" => {
            client.logout();
            println!("로그아웃 완료.");
            Ok(())
        }
        "help" | "-h" | "--help" => {
            cli::help();
            Ok(())
        }
        _ => {
            cli::help();
            std::process::exit(1);
        }
    };

    if let Err(error) = result {
        fail(&error);
    }
}
