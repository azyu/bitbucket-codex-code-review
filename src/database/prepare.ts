import { DataSource } from "typeorm";
import dataSource from "./data-source";

export async function prepareDatabase(source: DataSource): Promise<void> {
  await source.initialize();
  try {
    const queryRunner = source.createQueryRunner();
    let hasReviewRuns: boolean;
    try {
      hasReviewRuns = await queryRunner.hasTable("review_runs");
    } finally {
      await queryRunner.release();
    }

    if (!hasReviewRuns) await source.synchronize();
    await source.runMigrations();
  } finally {
    await source.destroy();
  }
}

if (require.main === module) {
  prepareDatabase(dataSource).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
