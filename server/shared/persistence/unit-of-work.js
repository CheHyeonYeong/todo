/**
 * 유스케이스 하나가 곧 하나의 원자적 변경 단위라는 것을 애플리케이션 계층이 선언하게 해 준다.
 * 저장소가 Postgres인지 파일인지는 어댑터가 감춘다.
 */
export class UnitOfWork {
  run(_userId, _work) { throw new Error("Not implemented"); }
}

export class PostgresUnitOfWork extends UnitOfWork {
  constructor(pool, schema) { super(); this.pool = pool; this.schema = schema; }

  async run(userId, work) {
    await this.schema.ensure();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work({ client, userId });
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * 파일 모드의 트랜잭션: 스냅샷을 한 번 읽어 작업에 넘기고, 끝나면 한 번만 쓴다.
 * 여러 컨텍스트의 리포지토리가 같은 스냅샷을 고쳐도 저장은 한 번이다.
 */
export class FileUnitOfWork extends UnitOfWork {
  constructor(store) { super(); this.store = store; }

  async run(userId, work) {
    const snapshot = await this.store.read(userId);
    const result = await work({ snapshot, userId });
    await this.store.write(snapshot, userId);
    return result;
  }
}
