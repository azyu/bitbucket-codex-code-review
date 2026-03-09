import { DynamicModule, Module } from "@nestjs/common";

export interface IOpenTelemetryModuleConfig {
  serviceName: string;
  serviceVersion?: string;
  metrics?: { enabled?: boolean; port?: number };
}

/**
 * OpenTelemetry NestJS 모듈 (placeholder - 실제 초기화는 main.ts에서 수행)
 * (원본: @lxp/shared-opentelemetry OpenTelemetryModule)
 */
@Module({})
export class OpenTelemetryModule {
  static forRoot(_config: IOpenTelemetryModuleConfig): DynamicModule {
    return {
      module: OpenTelemetryModule,
      global: true,
    };
  }
}
