/** 여러 컨텍스트가 똑같이 쓰는 원시값 정규화 규칙. */

export function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function finiteNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
}
