# Context map & ubiquitous language

## 바운디드 컨텍스트

| 컨텍스트 | 책임 | 소유한 API |
| --- | --- | --- |
| `identity` | 요청자가 누구인지 판단 | `GET /api/session` |
| `todo` | 할 일과 하위 목표의 계획·순서 (**핵심 도메인**) | `/api/todos*` |
| `notes` | 메모 보관, 메모에서 할 일 뽑기 | `/api/memos*` |
| `routines` | 반복 규칙과 오늘의 발생 | `/api/routines*` |
| `time` | 시간 기록 | `/api/sessions*` |
| `archiving` | 오래된 완료 기록 내보내기 (배치, HTTP 없음) | — |
| `workspace` | 전체 스냅샷 동기화 | `/api/data` |

## 컨텍스트 사이의 관계

```
        identity ──(사용자 식별)──▶ 모든 컨텍스트

        notes ──(고객-공급자)──▶ todo
          "메모를 적으며 할 일을 함께 뽑는다" — 하나의 작업 단위

        routines ──(고객-공급자)──▶ todo
          "루틴이 오늘의 할 일을 만든다" — RoutineMaterializer 한 곳에 모임

        workspace ──(통합)──▶ todo · notes · routines · time
          전체를 한 번에 읽고 쓰는 지점. 다른 컨텍스트의 모델을 조합한다.

        archiving ──(하위 스트림)──▶ todo · time
          완료된 기록만 읽어 내보내고 지운다. 위쪽은 archiving을 모른다.
```

경계를 넘는 협력은 위 네 곳뿐이고, 전부 **명시적인 한 파일**에 있다.

- `notes/application/notes-service.js` — 메모 캡처
- `routines/domain/routine-materializer.js` — 루틴 구체화
- `routines/application/routine-service.js` — 루틴 삭제 시 할 일과의 연결 끊기
- `workspace/infrastructure/postgres-workspace-repository.js` — 전체 스냅샷 조립

## 유비쿼터스 랭귀지

코드의 이름은 아래 표를 따른다. 같은 것을 다른 이름으로 부르지 않는다.

| 용어 | 뜻 | 코드 |
| --- | --- | --- |
| 할 일 (Todo) | 계획의 최소 단위 | `Todo` |
| 하위 목표 (sub task) | 할 일에 한 단계만 붙는 자식 | `todo.parentId`, `TodoTree` |
| 범위 (Scope) | 오늘 / 이번 주 / 이번 달 | `Scope` |
| 배치 (Placement) | 재배치 요청 한 건 | `TodoPlacement` |
| 메모 (Memo) | 적어 두는 글 | `Memo` |
| 캡처 (capture) | 메모를 적으며 할 일을 함께 뽑는 행위 | `NotesService.captureMemo` |
| 루틴 (Routine) | 반복 규칙 그 자체 | `Routine` |
| 발생 (occurrence) | 루틴이 특정 날짜에 만들어 낸 할 일 하나 | `RoutineMaterializer` |
| 구체화 (materialize) | 규칙을 오늘의 할 일로 바꾸는 것 | `pendingOccurrences` |
| 유효 기간 지난 발생 (stale) | 오늘 것이 아닌 루틴 할 일 | `staleOccurrenceIds` |
| 시간 기록 (TimeSession) | 시작–종료 한 구간 | `TimeSession` |
| 워크스페이스 (Workspace) | 한 사용자의 전체 데이터 | `WorkspaceSnapshot` |
| 보관 (archive) | 메일로 내보낸 뒤 목록에서 지우는 것 | `ArchiveService` |
| 보관 기준 (window) | "완료된 지 N개월" | `ArchiveWindow` |
| 스윕 (sweep) | 보관 배치 1회 실행 | `ArchiveService.sweep` |
| 작업 단위 (Unit of Work) | 함께 성공하거나 함께 실패하는 변경 묶음 | `UnitOfWork` |

### 이름에 대한 약속

- 삭제는 `delete`가 아니라 뜻에 따라 나눈다: 사용자가 지우면 `remove`, 보관 후 정리는 `purge`.
- 저장은 `save`가 아니라 뜻에 따라 나눈다: 새로 넣으면 `add`, 통째로 바꾸면 `replace`, 메모에서 뽑으면 `capture`.
- "clean"처럼 무엇을 하는지 알 수 없는 이름은 쓰지 않는다. 정규화는 각 값 객체의 `normalize`가 맡는다.
