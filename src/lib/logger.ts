import { Injectable, LoggerService } from "@nestjs/common";
import * as winston from "winston";
import { trace, context as otelContext } from "@opentelemetry/api";

/**
 * Winston 기반 로거 + OpenTelemetry trace_id 자동 주입
 * (원본: @lxp/shared-logger ServiceLogger)
 */
@Injectable()
export class ServiceLogger implements LoggerService {
  private logger: winston.Logger;

  constructor(private serviceName?: string) {
    this.logger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(
          ({ timestamp, level, message, context, stack }) => {
            const logObject: Record<string, unknown> = {
              timestamp,
              level,
              message,
              context: context || "Application",
              service: this.serviceName || "unknown",
            };

            const span = trace.getSpan(otelContext.active());
            if (span) {
              const spanContext = span.spanContext();
              if (spanContext.traceId) {
                logObject.trace_id = spanContext.traceId;
              }
            }

            if (stack) {
              logObject.stack = stack;
            }

            return JSON.stringify(logObject);
          },
        ),
      ),
      transports: [new winston.transports.Console()],
    });
  }

  private stringify(message: unknown): string {
    if (typeof message === "string") return message;
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }

  private formatLogWithContext(
    message: unknown,
    contextOrMeta?: unknown,
  ): { formattedMessage: string; context?: string } {
    const baseMessage = this.stringify(message);
    if (contextOrMeta === undefined) return { formattedMessage: baseMessage };
    if (typeof contextOrMeta === "string")
      return { formattedMessage: baseMessage, context: contextOrMeta };
    return {
      formattedMessage: `${baseMessage} ${this.stringify(contextOrMeta)}`,
    };
  }

  log(message: unknown, contextOrMeta?: unknown): void {
    const { formattedMessage, context } = this.formatLogWithContext(
      message,
      contextOrMeta,
    );
    this.logger.info(formattedMessage, { context });
  }

  error(message: unknown, stackOrContext?: unknown, context?: string): void {
    let errorMessage: string;
    let errorStack: string | undefined;
    let logContext = context;

    if (message instanceof Error) {
      errorStack = message.stack;
      errorMessage = message.message;
      if (typeof stackOrContext === "string") logContext = stackOrContext;
    } else {
      errorMessage = this.stringify(message);
      if (typeof stackOrContext === "string") {
        if (context) errorStack = stackOrContext;
        else logContext = stackOrContext;
      } else if (stackOrContext instanceof Error) {
        errorStack = stackOrContext.stack;
      } else if (stackOrContext !== undefined) {
        errorStack = this.stringify(stackOrContext);
      }
    }
    this.logger.error(errorMessage, { context: logContext, stack: errorStack });
  }

  warn(message: unknown, contextOrMeta?: unknown): void {
    const { formattedMessage, context } = this.formatLogWithContext(
      message,
      contextOrMeta,
    );
    this.logger.warn(formattedMessage, { context });
  }

  debug(message: unknown, contextOrMeta?: unknown): void {
    const { formattedMessage, context } = this.formatLogWithContext(
      message,
      contextOrMeta,
    );
    this.logger.debug(formattedMessage, { context });
  }

  verbose(message: unknown, contextOrMeta?: unknown): void {
    const { formattedMessage, context } = this.formatLogWithContext(
      message,
      contextOrMeta,
    );
    this.logger.verbose(formattedMessage, { context });
  }
}
