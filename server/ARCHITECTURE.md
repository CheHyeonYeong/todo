# Server architecture

서버는 **바운디드 컨텍스트별로 먼저 나누고, 그 안에서 계층을 나눈다.**
디렉터리를 열었을 때 "이 코드가 무엇에 관한 것인지"가 먼저 보이고, "어떤 기술을 쓰는지"는 그다음이다.

```
server/
  server.js            프로세스 시작만
  composition-root.js  어떤 어댑터를 쓸지 정하는 유일한 자리
  shared/              공유 커널 + 기술 기반 (설정, 시계, 저장소 공통, HTTP 커널)
  contexts/
    identity/          누가 요청했는가
    planning/          할 일과 하위 목표 (핵심 도메인)
    notes/             메모, 그리고 메모에서 할 일 뽑기
    routines/          반복 규칙 → 오늘의 할 일
    time-tracking/     시간 기록
    archiving/         오래된 완료 기록 내보내기
    workspace/         위 전부를 한 번에 읽고 쓰는 통합 지점
```

## 계층과 의존 방향

각 컨텍스트는 자기 안에 같은 네 계층을 갖는다. 화살표는 컴파일 타임 의존 방향이다.

```
interfaces/  →  application/  →  domain/
                                    ↑
                            infrastructure/
```

- `domain/` — 엔티티, 값 객체, 도메인 서비스. HTTP·SQL·파일·SMTP를 하나도 모른다.
- `application/` — 유스케이스와 **포트**(`ports.js`). 입력을 도메인 객체로 바꾸고, 작업 단위를 열고, 포트에 맡긴다.
- `infrastructure/` — 포트의 구현(어댑터). 도메인에 의존하는 것은 정상이고, 그 반대는 없다.
- `interfaces/http/` — JSON ↔ 유스케이스 번역만. 도메인 규칙은 한 줄도 없다.

### Presentation ↔ Application 경계

`HttpExchange`가 표현 계층의 끝이다. `request`/`response` 객체는 여기서 멈추고 그 아래로 넘어가지 않는다.
인증도 마찬가지로 `Authorization` 헤더는 표현 계층에서 `AccessToken` 값 객체로 바뀐 뒤에야 아래로 내려간다.

라우터는 컨텍스트마다 하나씩이고, 각자 자기 경로만 처리한다. 처리했으면 `true`, 아니면 `false`를 돌려주며
`ApiController`는 인증 경계를 세우고 라우터 체인을 돌리는 일만 한다.

### Application ↔ Domain 경계

애플리케이션 서비스에는 `if`가 거의 없다. 판단은 전부 도메인에 있다.

| 판단 | 사는 곳 |
| --- | --- |
| 하위 목표는 한 단계까지만, 부모와 같은 범위 | `planning/domain/todo-tree.js` |
| 하위 목표가 다 끝나면 부모도 끝난 것 | `planning/domain/todo-tree.js` |
| 오늘 이 루틴이 도는가 | `routines/domain/routine.js` |
| 무엇이 보관 대상인가 | `archiving/domain/archive-policy.js` |
| 워크스페이스 전체의 정렬·트리 불변식 | `workspace/domain/workspace-snapshot.js` |

### 작업 단위(Unit of Work)

유스케이스 하나가 곧 하나의 원자적 변경이다. `unitOfWork.run(userId, work)` 안에서 일어난 일은 함께 성공하거나 함께 실패한다.

- Postgres 모드: 하나의 트랜잭션
- 파일 모드: 스냅샷을 **한 번** 읽어 작업에 넘기고, 끝나면 **한 번** 쓴다

덕분에 여러 컨텍스트의 리포지토리가 한 유스케이스에서 함께 움직여도 저장은 한 번이다.

## 애그리게이트

- **Todo 트리** — 최상위 할 일과 그 하위 목표가 하나의 일관성 단위다.
  하위 목표의 완료 상태를 바꾸면 부모가 같은 트랜잭션 안에서 다시 계산된다.
- **Memo** — 스스로 완결된 작은 애그리게이트.
- **Routine** — 반복 규칙. 규칙과 그 규칙이 만들어 낸 할 일은 서로 다른 애그리게이트다.
- **WorkspaceSnapshot** — `/api/data`와 파일 저장처럼 **전체를 통째로** 다루는 경계에서만 쓰는 애그리게이트 루트.
  개별 유스케이스는 이걸 거치지 않는다.

## 엔티티와 값 객체

| | 엔티티 | 값 객체 |
| --- | --- | --- |
| 동일성 | `id`로 구분 | 값이 같으면 같은 것 |
| 변경 | 상태가 바뀌어도 같은 것 | 불변 (`Object.freeze`) |
| 예 | `Todo`, `Memo`, `Routine`, `TimeSession` | `Scope`, `DueDate`, `TodoPlacement`, `WeekdaySet`, `RoutineChanges`, `CalendarDay`, `ArchiveWindow`, `AccessToken` |

값 객체는 정규화 규칙과 판단을 소유한다. 다만 엔티티 필드에는 원시값을 담는다
(`todo.scope`는 `Scope` 인스턴스가 아니라 `"day"`) — 기존 JSON 응답 형태를 그대로 유지하기 위한 선택이다.
규칙이 흩어지지 않는다는 이득은 그대로 얻으면서, 저장 형식과 API는 건드리지 않는다.

## 저장소

`DATABASE_URL`이 있으면 Postgres, 없으면 `store.json` 파일이다.
**어느 쪽인지 아는 코드는 `composition-root.js` 하나뿐이다.** 나머지는 포트만 본다.

스키마는 각 컨텍스트가 자기 테이블 DDL만 내놓고, `SchemaInstaller`가
`create → alter → backfill → index` 순서로 조립해 실행한다.

## 호환성

공개 API 경로, 응답 형태, 환경 변수는 그대로다. 진입점도 `server/server.js` 그대로다.

컨텍스트 사이의 협력 관계와 용어 사전은 [CONTEXT-MAP.md](./CONTEXT-MAP.md)를 참고.
