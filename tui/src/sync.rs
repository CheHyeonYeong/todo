//! 네트워크 쓰기를 별도 스레드로 보낸다. UI 스레드는 절대 API를 기다리지 않는다.
use crate::api::Client;
use crate::model::{Data, OrderItem, Todo};
use serde_json::Value;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::thread;

/// UI -> 워커
pub enum Job {
    Create(Todo),
    Patch(String, Value),
    Delete(String),
    Restore(Vec<Todo>),
    Reorder(Vec<OrderItem>),
    CreateSession(Value),
    CreateMemo(Value),
    CreateRoutine(Value),
    PatchRoutine(String, Value),
    DeleteRoutine(String),
    Refresh,
}

/// 워커 -> UI
pub enum Event {
    /// 쓰기 하나가 끝났다
    Done,
    /// 쓰기 실패. UI는 메시지를 띄우고 서버 상태로 다시 맞춘다.
    Failed(String),
    /// 새로고침 결과 (할 일 + 시간 기록 + 루틴)
    Data(Box<Data>),
    /// 새로고침 실패. 여기서 또 새로고침을 걸면 서버가 죽었을 때 무한 재시도가 된다.
    RefreshFailed(String),
}

pub struct Sync {
    jobs: Sender<Job>,
    pub events: Receiver<Event>,
    /// 아직 서버 응답을 못 받은 쓰기 개수
    pub in_flight: usize,
}

impl Sync {
    pub fn spawn(mut client: Client) -> Self {
        let (job_tx, job_rx) = channel::<Job>();
        let (event_tx, event_rx) = channel::<Event>();
        thread::spawn(move || {
            for job in job_rx {
                let result = match &job {
                    Job::Create(todo) => serde_json::to_value(todo)
                        .map_err(|error| error.to_string())
                        .and_then(|body| client.create_todo(&body).map(|_| ())),
                    Job::Patch(id, patch) => client.patch_todo(id, patch),
                    Job::Delete(id) => client.delete_todo(id),
                    Job::Restore(todos) => todos.iter().try_for_each(|todo| client.restore_todo(todo)),
                    Job::Reorder(items) => client.reorder(items),
                    Job::CreateSession(session) => client.create_session(session),
                    Job::CreateMemo(memo) => client.create_memo(memo, &Value::Array(vec![])),
                    Job::CreateRoutine(routine) => client.create_routine(routine),
                    Job::PatchRoutine(id, patch) => client.patch_routine(id, patch),
                    Job::DeleteRoutine(id) => client.delete_routine(id),
                    Job::Refresh => {
                        let _ = event_tx.send(match client.fetch_data() {
                            Ok(data) => Event::Data(Box::new(data)),
                            Err(error) => Event::RefreshFailed(error),
                        });
                        continue;
                    }
                };
                let _ = event_tx.send(match result {
                    Ok(()) => Event::Done,
                    Err(error) => Event::Failed(error),
                });
            }
        });
        Sync {
            jobs: job_tx,
            events: event_rx,
            in_flight: 0,
        }
    }

    pub fn send(&mut self, job: Job) {
        let counts = !matches!(job, Job::Refresh);
        if self.jobs.send(job).is_ok() && counts {
            self.in_flight += 1;
        }
    }

    pub fn settle(&mut self) {
        self.in_flight = self.in_flight.saturating_sub(1);
    }
}
