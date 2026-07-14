---
name: todo-cli
description: Use the `todo` terminal CLI to read and manage the user's todos, memos, and time-tracking sessions. Use when the user asks to add/complete/remove todos, take a memo, track work time, or inspect their task list from the terminal.
---

# todo CLI

`todo`는 웹앱(https://todo-cohe.vercel.app)과 같은 API를 쓰는 터미널 클라이언트다 (Rust 단일 바이너리).
할 일(todo) 3단계 기간(오늘/이번 주/이번 달), 2뎁스 하위 목표, 카테고리, 메모, 시간 기록을 지원한다.

## 에이전트가 지켜야 할 것

- **인자 없는 `todo`는 전체화면 대화형 TUI를 연다. 에이전트는 절대 실행하지 말 것.** 항상 서브커맨드를 쓴다.
- 상태를 읽을 때는 `todo list --json`을 쓴다. 사람이 읽을 출력은 `todo list`.
- `done`/`rm`은 **번호**(리스트 순번)를 받는다. 번호는 목록이 바뀌면 달라지므로, **변경 직전에 반드시 `todo list --json`으로 다시 확인**하고 `number` 필드를 쓴다.
- 실수했으면 `todo undo`로 마지막 add/done/rm 한 건을 되돌릴 수 있다.
- 인증이 안 되어 있으면 명령이 "로그인이 필요합니다"로 실패한다. 이때는 사용자에게 `todo login`(브라우저 Google 로그인)을 직접 실행하라고 안내한다. 에이전트가 대신 할 수 없다.

## 설치

```bash
npm install -g https://todo-cohe.vercel.app/cli.tgz          # 플랫폼별 바이너리를 릴리스에서 받음
# 또는 Rust 툴체인이 있으면
cargo install --git https://github.com/CheHyeonYeong/todo todo
```

## 명령 레퍼런스

```bash
todo list [--json]        # 할 일 목록. --json: [{number, id, title, scope, done, category, dueDate, parentId, ...}]
todo add "제목" [옵션]     # 추가. -w 이번 주, -m 이번 달 (기본: 오늘), -d YYYY-MM-DD 마감일, -c 카테고리
todo done <번호>           # 완료 토글 (이미 완료면 미완료로). `todo toggle <번호>`도 동일
todo rm <번호>             # 삭제 (하위 목표도 함께 삭제됨)
todo undo                  # 마지막 add/done/rm 되돌리기 (1단계)
todo memo "내용 #태그"     # 메모 저장. 본문의 `- [ ] 항목` 줄은 오늘 할 일로 자동 추출됨
todo memos [개수]          # 최근 메모 (기본 10개)
todo track "작업명"        # 시간 기록 시작
todo stop                  # 시간 기록 종료 후 타임테이블에 저장
todo log [--week]          # 오늘 타임테이블 / 이번 주 작업별 합계
todo status                # 로그인 계정, 기록 중인 작업 확인
```

## 예시

```bash
# 사용자가 "내일까지 보고서 쓰기 추가해줘" 라고 하면
todo add "보고서 쓰기" -d 2026-07-15 -c 업무

# "보고서 쓰기 완료 처리해줘" 라고 하면
todo list --json          # number 확인 후
todo done 3

# 회의 메모를 남기면서 할 일 추출
todo memo "기획 회의 #회의
- [ ] 시안 검토
- [ ] 일정 공유"
```

## JSON 출력 형식

`todo list --json`은 화면 표시 순서대로 정렬된 배열을 출력한다:

- `number`: `done`/`rm`에 쓰는 순번 (1부터)
- `scope`: `day` | `week` | `month`
- `parentId`: 하위 목표면 부모의 `id`, 아니면 `null`
- `category`, `dueDate`(YYYY-MM-DD), `note`: 없으면 `null`
- `done`, `completedAt`, `createdAt`, `sortOrder`

## 환경 변수

- `TODO_API_BASE`: 다른 서버 사용 (예: `http://localhost:3000`). 기본은 프로덕션 서버.
