import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { SCHEMA_NAME_CODE_REVIEW } from "@lib/index";
import { createDbPoolConfig, CustomNamingStrategy } from "@lib/database";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: "mysql",
        host: configService.get("database.host"),
        port: configService.get("database.port"),
        username: configService.get("database.username"),
        password: configService.get("database.password"),
        database:
          configService.get("database.database") ?? SCHEMA_NAME_CODE_REVIEW,
        autoLoadEntities: true,
        synchronize: configService.get("database.synchronize"),
        logging: configService.get("database.logging"),
        timezone: "Z",
        charset: "utf8mb4_0900_ai_ci",
        namingStrategy: new CustomNamingStrategy(),
        extra: createDbPoolConfig(
          configService.get<number>("database.poolSize")!,
          configService.get<number>("database.maxIdle")!,
        ),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
