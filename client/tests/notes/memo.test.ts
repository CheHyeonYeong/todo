import { describe, expect, test } from "vitest";
import { extractTags, extractTodoTitles, withDerivedTags } from "../../src/notes/model/memoRules";

describe("extractTags", () => {
  test("# 뒤의 태그를 순서대로 모은다", () => {
    expect(extractTags("#작업 정리하고 #회고 쓰기")).toEqual(["작업", "회고"]);
  });

  test("공백과 # 앞까지를 태그로 본다", () => {
    expect(extractTags("#todo-list #v2 #snake_case")).toEqual(["todo-list", "v2", "snake_case"]);
  });

  test("구두점에서 끊는다", () => {
    expect(extractTags("#작업, 정리")).toEqual(["작업"]);
    expect(extractTags("#회고. 끝")).toEqual(["회고"]);
    expect(extractTags("(#기획)")).toEqual(["기획"]);
  });

  test("라틴이 아닌 글자도 태그가 된다", () => {
    expect(extractTags("#기획 #プラン #план")).toEqual(["기획", "プラン", "план"]);
  });

  test("태그가 없으면 빈 배열이다", () => {
    expect(extractTags("그냥 메모")).toEqual([]);
    expect(extractTags("# 뒤에 공백이면 태그가 아니다")).toEqual([]);
  });

  test("중복은 그대로 남는다", () => {
    expect(extractTags("#a #a")).toEqual(["a", "a"]);
  });
});

describe("withDerivedTags", () => {
  test("본문이 바뀌면 태그를 다시 계산한다", () => {
    expect(withDerivedTags({ body: "#새태그 내용" })).toEqual({ body: "#새태그 내용", tags: ["새태그"] });
  });

  test("본문에서 태그가 사라지면 태그도 비운다", () => {
    expect(withDerivedTags({ body: "태그 없는 본문" })).toEqual({ body: "태그 없는 본문", tags: [] });
  });

  test("본문이 없는 패치는 그대로 둔다", () => {
    const patch = { title: "제목만 변경" };
    expect(withDerivedTags(patch)).toEqual(patch);
  });

  test("빈 본문도 본문 변경으로 본다", () => {
    expect(withDerivedTags({ body: "" })).toEqual({ body: "", tags: [] });
  });
});

describe("extractTodoTitles", () => {
  test("체크박스 줄을 할 일로 뽑는다", () => {
    expect(extractTodoTitles("- [ ] 우유 사기\n- [] 청소")).toEqual(["우유 사기", "청소"]);
  });

  test("todo: 접두사도 인식하고 대소문자를 가리지 않는다", () => {
    expect(extractTodoTitles("todo: 메일 보내기\nTODO: 예약 확인")).toEqual(["메일 보내기", "예약 확인"]);
  });

  test("앞쪽 공백을 허용한다", () => {
    expect(extractTodoTitles("   - [ ] 들여쓴 항목")).toEqual(["들여쓴 항목"]);
  });

  test("완료 표시된 줄과 일반 문장은 무시한다", () => {
    expect(extractTodoTitles("- [x] 이미 한 일\n그냥 문장\n- 목록이지만 체크박스 아님")).toEqual([]);
  });

  test("제목 앞뒤 공백은 정리한다", () => {
    expect(extractTodoTitles("- [ ]   여백 있는 항목  ")).toEqual(["여백 있는 항목"]);
  });

  test("빈 본문은 빈 배열이다", () => {
    expect(extractTodoTitles("")).toEqual([]);
  });
});
