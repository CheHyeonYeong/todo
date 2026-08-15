/**
 * 여러 바운디드 컨텍스트가 하나의 물리 스키마를 공유한다.
 * 각 컨텍스트는 자기 테이블 DDL만 내놓고, 실행 순서는 여기서 조립한다.
 * (create -> alter -> backfill -> index 순서라 컬럼이 생기기 전에 인덱스가 만들어지지 않는다.)
 */
export class SchemaInstaller {
  constructor(pool, contributions) {
    this.pool = pool;
    this.contributions = contributions;
  }

  statements(phase) {
    return this.contributions.flatMap((contribution) => contribution[phase] || []);
  }

  async ensure() {
    if (!this.pool) return;
    for (const phase of ["create", "alter", "backfill", "index"]) {
      for (const statement of this.statements(phase)) {
        await this.pool.query(statement);
      }
    }
  }
}
