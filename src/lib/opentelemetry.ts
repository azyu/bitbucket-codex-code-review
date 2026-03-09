import { Logger } from "@nestjs/common";
import { DEFAULTS } from "../config/configuration";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { MySQL2Instrumentation } from "@opentelemetry/instrumentation-mysql2";
import { NestInstrumentation } from "@opentelemetry/instrumentation-nestjs-core";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { containerDetector } from "@opentelemetry/resource-detector-container";
import {
  detectResources,
  envDetector,
  hostDetector,
  osDetector,
  processDetector,
  resourceFromAttributes,
  serviceInstanceIdDetector,
} from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export interface IOpenTelemetryBootstrapConfig {
  metricsPort?: number;
  metricsEndpoint?: string;
  metricsEnabled?: boolean;
}

/**
 * OpenTelemetry SDK 초기화 (NestJS 앱 시작 전 호출 필수)
 * (원본: @lxp/shared-opentelemetry initOpenTelemetry)
 */
export async function initOpenTelemetry(
  serviceName: string,
  config?: IOpenTelemetryBootstrapConfig,
): Promise<NodeSDK | undefined> {
  const metricsPort =
    config?.metricsPort ?? Number(process.env["METRICS_PORT"] || String(DEFAULTS.METRICS_PORT));
  const metricsEndpoint = config?.metricsEndpoint ?? "/metrics";
  const metricsEnabled = config?.metricsEnabled ?? true;
  const otlpEnabled = !!process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];

  const resourceDetectors = [
    envDetector,
    hostDetector,
    osDetector,
    processDetector,
    serviceInstanceIdDetector,
    containerDetector,
  ];

  const detectedResource = await detectResources({
    detectors: resourceDetectors,
  });
  const resource = detectedResource.merge(
    resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
  );

  if (metricsEnabled) {
    Logger.log(
      `Metrics config detected (port=${metricsPort}, endpoint=${metricsEndpoint})`,
    );
  }

  const traceExporter = otlpEnabled ? new OTLPTraceExporter() : undefined;
  if (traceExporter) Logger.log("OTLP traces exporter enabled");

  const logRecordProcessor = otlpEnabled
    ? new BatchLogRecordProcessor(new OTLPLogExporter())
    : undefined;
  if (logRecordProcessor) Logger.log("OTLP logs exporter enabled");

  const sdk = new NodeSDK({
    resource,
    textMapPropagator: new W3CTraceContextPropagator(),
    ...(logRecordProcessor && { logRecordProcessor }),
    ...(traceExporter && { traceExporter }),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      new WinstonInstrumentation(),
      new IORedisInstrumentation(),
      new MySQL2Instrumentation(),
    ],
  });

  sdk.start();
  Logger.log(`OpenTelemetry SDK initialized for ${serviceName}`);

  process.on("SIGTERM", () => {
    sdk
      .shutdown()
      .then(() => Logger.log("OpenTelemetry SDK terminated"))
      .catch((error: unknown) => Logger.error("Error terminating OTel SDK", error));
  });

  return sdk;
}
