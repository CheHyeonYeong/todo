#!/usr/bin/env bash
# skills/ 의 스킬을 각 에이전트가 읽는 디렉터리에 연결한다.
#   Claude Code -> .claude/skills/   Codex CLI -> .codex/skills/   그 외(Cline, Zed 등) -> .agents/skills/
# 원본은 skills/ 하나뿐이다. 링크가 안 되는 파일시스템에서는 복사로 대체한다(그때는 스킬을 고친 뒤 다시 실행할 것).
# 에이전트 디렉터리는 .gitignore 대상이라 커밋되지 않는다.
set -euo pipefail

cd "$(dirname "$0")/.."
targets=(.claude/skills .codex/skills .agents/skills)

for target in "${targets[@]}"; do
  mkdir -p "$target"
  for source in skills/*/; do
    name="$(basename "$source")"
    link="$target/$name"
    rm -rf "$link"
    if ln -s "$(realpath --relative-to="$target" "$source")" "$link" 2>/dev/null; then
      echo "linked  $link"
    else
      cp -r "$source" "$link"
      echo "copied  $link (심볼릭 링크 미지원)"
    fi
  done
done
