import { DefaultNamingStrategy } from "typeorm";
import * as Joi from "joi";

/**
 * TypeORM snake_case 네이밍 전략
 * (원본: @lxp/shared-database CustomNamingStrategy)
 */
export class CustomNamingStrategy extends DefaultNamingStrategy {
  override tableName(className: string, customName: string): string {
    const name = customName || className;
    const withoutEntity = name.replace(/Entity$/, "");
    return this.toSnakeCase(withoutEntity);
  }

  toSnakeCase(str: string): string {
    return str
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
      .toLowerCase();
  }
}

/**
 * MySQL2 connection pool 설정
 * (원본: @lxp/shared-database createDbPoolConfig)
 */
export function createDbPoolConfig(poolSize: number, maxIdle: number) {
  return {
    connectionLimit: poolSize,
    maxIdle,
    waitForConnections: true,
    queueLimit: 0,
    idleTimeout: 3600000,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
  };
}

/** DB pool Joi validation schema fields */
export const dbPoolValidationSchema = {
  DB_POOL_SIZE: Joi.number().default(5),
  DB_POOL_MAX_IDLE: Joi.number().default(2),
};
