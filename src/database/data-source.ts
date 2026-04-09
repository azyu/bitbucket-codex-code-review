import "reflect-metadata";
import { DataSource } from "typeorm";
import { ReviewRunEntity } from "../entities/review-run.entity";
import { CustomNamingStrategy } from "../lib/database";
import { SCHEMA_NAME_CODE_REVIEW } from "../lib";

const port = parseInt(process.env["DB_PORT"] || "3309", 10);

export default new DataSource({
  type: "mysql",
  host: process.env["DB_HOST"] || "localhost",
  port,
  username: process.env["DB_USERNAME"] || "root",
  password: process.env["DB_PASSWORD"] || "",
  database: process.env["DB_NAME"] || SCHEMA_NAME_CODE_REVIEW,
  entities: [ReviewRunEntity],
  migrations: ["dist/database/migrations/*.js"],
  synchronize: false,
  logging: false,
  namingStrategy: new CustomNamingStrategy(),
});
