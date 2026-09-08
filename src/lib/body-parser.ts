import type { IncomingMessage } from "node:http";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ServiceLogger } from "./logger";

/**
 * Bitbucket PR webhook payloads embed the whole `pullrequest` object, whose
 * `description` is repeated as `rendered`/`summary` HTML. A long description
 * alone pushes the payload past body-parser's 100KiB default, and Bitbucket
 * Cloud never re-delivers — the `@codex` trigger is lost silently.
 *
 * Must be called BEFORE `app.listen()`: `useBodyParser` registers a
 * `jsonParser` layer, which makes Nest's own init skip the default-limit one
 * (`ExpressAdapter.isMiddlewareApplied`). The `rawBody: true` app option is
 * still honoured, so `WebhookGuard`'s HMAC over `request.rawBody` keeps working.
 */
export function configureBodyParser(
  app: NestExpressApplication,
  limit = "5mb",
): void {
  const logger = new ServiceLogger("BodyParser");

  app.useBodyParser("json", { limit });

  // body-parser rejects oversized payloads before any guard or controller runs,
  // so the repo slug is unrecoverable. Log the delivery headers Bitbucket is
  // documented to send — without this the only symptom is "@codex 무반응".
  app.use(
    (
      err: { status?: number },
      req: IncomingMessage,
      _res: unknown,
      next: (err?: unknown) => void,
    ) => {
      if (err.status === 413) {
        logger.error(
          `Request body rejected: too large (limit ${limit}) ` +
            `content-length=${req.headers["content-length"] ?? "unknown"} ` +
            `x-event-key=${req.headers["x-event-key"] ?? "unknown"} ` +
            `x-hook-uuid=${req.headers["x-hook-uuid"] ?? "unknown"} ` +
            `x-request-uuid=${req.headers["x-request-uuid"] ?? "unknown"}`,
        );
      }
      next(err);
    },
  );
}
