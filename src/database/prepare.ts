import { DataSource } from "typeorm";
import dataSource from "./data-source";

const PREPARE_LOCK = "bb-codex-review:database-prepare";

export async function prepareDatabase(source: DataSource): Promise<void> {
  await source.initialize();
  const queryRunner = source.createQueryRunner();
  let locked = false;
  try {
    await queryRunner.connect();
    const rows = await queryRunner.query(
      "SELECT GET_LOCK(?, 600) AS acquired",
      [PREPARE_LOCK],
    ) as Array<{ acquired: string | number | null }>;
    if (Number(rows[0]?.acquired) !== 1) {
      throw new Error("Timed out waiting for database preparation lock");
    }
    locked = true;

    if (!(await queryRunner.hasTable("review_runs"))) {
      await source.synchronize();
    }
    await source.runMigrations();
  } finally {
    try {
      if (locked) {
        await queryRunner.query("SELECT RELEASE_LOCK(?)", [PREPARE_LOCK]);
      }
    } finally {
      try {
        await queryRunner.release();
      } finally {
        await source.destroy();
      }
    }
  }
}

if (require.main === module) {
  prepareDatabase(dataSource).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
