import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BitbucketService } from "./bitbucket.service";

const DEFAULT_CREDENTIALS = { apiTokens: ["token"] };

describe("BitbucketService", () => {
  const createService = async (
    configOverrides: Record<string, unknown> = {},
  ): Promise<BitbucketService> => {
    const defaults: Record<string, unknown> = {
      "bitbucket.baseUrl": "https://api.bitbucket.org/2.0",
      "bitbucket.repoTokens": {},
      "bitbucket.apiToken": "",
      "bitbucket.username": "",
      "bitbucket.appPassword": "",
      ...configOverrides,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BitbucketService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              return key in defaults ? defaults[key] : defaultValue;
            }),
          },
        },
      ],
    }).compile();

    return module.get<BitbucketService>(BitbucketService);
  };

  describe("resolveAuthHeader (via createComment)", () => {
    const mockFetch = (authHeaderCapture: string[]) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1 }),
      });
      const originalFetch = global.fetch as jest.Mock;
      originalFetch.mockImplementation(
        (_url: string, options: RequestInit) => {
          const auth = (options.headers as Record<string, string>)[
            "Authorization"
          ];
          authHeaderCapture.push(auth);
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 1 }),
          });
        },
      );
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const commentParams = {
      workspace: "my-workspace",
      repoSlug: "my-repo",
      pullRequestId: 1,
      body: "test",
    };

    it("uses repo-specific token when available", async () => {
      const service = await createService({
        "bitbucket.repoTokens": { "my-repo": "repo-token-123" },
        "bitbucket.apiToken": "global-token",
      });
      const captured: string[] = [];
      mockFetch(captured);

      await service.createComment(commentParams, {
        apiTokens: ["repo-token-123", "global-token"],
      });

      expect(captured[0]).toBe("Bearer repo-token-123");
    });

    it("falls back to global apiToken when no repo token", async () => {
      const service = await createService({
        "bitbucket.repoTokens": { "other-repo": "other-token" },
        "bitbucket.apiToken": "global-token",
      });
      const captured: string[] = [];
      mockFetch(captured);

      await service.createComment(commentParams, {
        apiTokens: ["global-token"],
      });

      expect(captured[0]).toBe("Bearer global-token");
    });

    it("falls back to Basic auth when no tokens exist", async () => {
      const service = await createService({
        "bitbucket.username": "myuser",
        "bitbucket.appPassword": "mypass",
      });
      const captured: string[] = [];
      mockFetch(captured);

      await service.createComment(commentParams, {
        apiTokens: [],
        username: "myuser",
        appPassword: "mypass",
      });

      const expected = `Basic ${Buffer.from("myuser:mypass").toString("base64")}`;
      expect(captured[0]).toBe(expected);
    });

    it("returns Basic header with empty creds when nothing configured", async () => {
      const service = await createService({});
      const captured: string[] = [];
      mockFetch(captured);

      await service.createComment(commentParams, { apiTokens: [] });

      const expected = `Basic ${Buffer.from(":").toString("base64")}`;
      expect(captured[0]).toBe(expected);
    });

    it("prefers repo token over all other auth methods", async () => {
      const service = await createService({
        "bitbucket.repoTokens": { "my-repo": "repo-specific" },
        "bitbucket.apiToken": "global-api-token",
        "bitbucket.username": "user",
        "bitbucket.appPassword": "pass",
      });
      const captured: string[] = [];
      mockFetch(captured);

      await service.createComment(commentParams, {
        apiTokens: ["repo-specific", "global-api-token"],
        username: "user",
        appPassword: "pass",
      });

      expect(captured[0]).toBe("Bearer repo-specific");
    });

    it("retries a repository token 401 with the global api token", async () => {
      const service = await createService({
        "bitbucket.repoTokens": { "my-repo": "expired-repo-token" },
        "bitbucket.apiToken": "global-token",
      });
      const captured: string[] = [];
      global.fetch = jest
        .fn()
        .mockImplementation((_url: string, options: RequestInit) => {
          captured.push(
            (options.headers as Record<string, string>)["Authorization"],
          );
          return Promise.resolve(
            captured.length === 1
              ? { ok: false, status: 401, text: async () => "expired" }
              : { ok: true, json: async () => ({ id: 1 }) },
          );
        });

      await expect(
        service.createComment(commentParams, {
          apiTokens: ["expired-repo-token", "global-token"],
        }),
      ).resolves.toEqual({ id: 1 });
      expect(captured).toEqual([
        "Bearer expired-repo-token",
        "Bearer global-token",
      ]);
    });

    it("does not retry a repository token 401 without global credentials", async () => {
      const service = await createService({
        "bitbucket.repoTokens": { "my-repo": "expired-repo-token" },
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "expired",
      });

      await expect(
        service.createComment(commentParams, {
          apiTokens: ["expired-repo-token"],
        }),
      ).rejects.toThrow("Bitbucket API error 401: expired");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("comment APIs", () => {
    const baseParams = {
      workspace: "my-workspace",
      repoSlug: "my-repo",
      pullRequestId: 7,
      body: "hello",
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("creates a reply comment with parent id", async () => {
      const service = await createService({
        "bitbucket.baseUrl": "https://api.example.test",
        "bitbucket.apiToken": "token",
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 11 }),
      });

      await expect(
        service.replyToComment({ ...baseParams, parentCommentId: 99 }, DEFAULT_CREDENTIALS),
      ).resolves.toEqual({ id: 11 });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.test/repositories/my-workspace/my-repo/pullrequests/7/comments",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: { raw: "hello" },
            parent: { id: 99 },
          }),
        }),
      );
    });

    it("creates an inline comment with path and destination line", async () => {
      const service = await createService({
        "bitbucket.baseUrl": "https://api.example.test",
        "bitbucket.apiToken": "token",
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 12 }),
      });

      await expect(
        service.createInlineComment({
          ...baseParams,
          filePath: "src/app.ts",
          line: 42,
        }, DEFAULT_CREDENTIALS),
      ).resolves.toEqual({ id: 12 });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.test/repositories/my-workspace/my-repo/pullrequests/7/comments",
        expect.objectContaining({
          body: JSON.stringify({
            content: { raw: "hello" },
            inline: {
              path: "src/app.ts",
              to: 42,
            },
          }),
        }),
      );
    });

    it("throws Bitbucket API error body for failed top-level comments", async () => {
      const service = await createService({
        "bitbucket.apiToken": "token",
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "unauthorized",
      });

      await expect(service.createComment(baseParams, DEFAULT_CREDENTIALS)).rejects.toThrow(
        "Bitbucket API error 401: unauthorized",
      );
    });

    it("throws Bitbucket API error body for failed replies", async () => {
      const service = await createService({
        "bitbucket.apiToken": "token",
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "missing parent",
      });

      await expect(
        service.replyToComment({ ...baseParams, parentCommentId: 99 }, DEFAULT_CREDENTIALS),
      ).rejects.toThrow("Bitbucket API error 404: missing parent");
    });

    it("throws inline-specific API error body for failed inline comments", async () => {
      const service = await createService({
        "bitbucket.apiToken": "token",
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "invalid line",
      });

      await expect(
        service.createInlineComment({
          ...baseParams,
          filePath: "src/app.ts",
          line: 42,
        }, DEFAULT_CREDENTIALS),
      ).rejects.toThrow(
        "Bitbucket inline comment API error 400: invalid line",
      );
    });
  });

  describe("rate-limit retry", () => {
    const params = {
      workspace: "my-workspace",
      repoSlug: "my-repo",
      pullRequestId: 7,
      body: "hello",
    };
    const ok = (id: number) => ({
      ok: true,
      status: 201,
      json: async () => ({ id }),
    });
    const failure = (status: number, retryAfter?: string) => ({
      ok: false,
      status,
      headers: new Headers(
        retryAfter === undefined ? {} : { "Retry-After": retryAfter },
      ),
      body: { cancel: jest.fn().mockResolvedValue(undefined) },
      text: async () => `status ${status}`,
    });
    let service: BitbucketService;
    let waitSpy: jest.SpyInstance<Promise<void>, [number]>;

    const mockResponses = (...responses: unknown[]): string[] => {
      const captured: string[] = [];
      const fetchMock = jest.fn((_url: string, options: RequestInit) => {
        captured.push(
          (options.headers as Record<string, string>)["Authorization"],
        );
        return Promise.resolve(responses[captured.length - 1]);
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      return captured;
    };

    beforeEach(async () => {
      service = await createService();
      waitSpy = jest
        .spyOn(
          service as unknown as { wait: (ms: number) => Promise<void> },
          "wait",
        )
        .mockResolvedValue(undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("retries 429 with the same auth header and drains only the retried response", async () => {
      const limited = failure(429);
      const captured = mockResponses(limited, ok(1));

      await expect(
        service.createComment(params, DEFAULT_CREDENTIALS),
      ).resolves.toEqual({ id: 1 });

      expect(captured).toEqual(["Bearer token", "Bearer token"]);
      expect(limited.body.cancel).toHaveBeenCalledTimes(1);
      expect(waitSpy).toHaveBeenCalledWith(1000);
    });

    it("gives up after 3 attempts of 503 without draining the final response", async () => {
      const last = failure(503);
      mockResponses(failure(503), failure(503), last);

      await expect(
        service.createComment(params, DEFAULT_CREDENTIALS),
      ).rejects.toThrow("Bitbucket API error 503: status 503");
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(waitSpy).toHaveBeenCalledTimes(2);
      expect(last.body.cancel).not.toHaveBeenCalled();
    });

    it.each([
      ["delta-seconds before Date.parse", "2", 2000],
      ["missing header", undefined, 1000],
      ["unparseable header", "soon", 1000],
      ["past HTTP-date", "Thu, 01 Jan 2015 00:00:00 GMT", 0],
    ])("waits per Retry-After (%s)", async (_label, retryAfter, expectedMs) => {
      mockResponses(failure(429, retryAfter), ok(1));

      await service.createComment(params, DEFAULT_CREDENTIALS);

      expect(waitSpy).toHaveBeenCalledWith(expectedMs);
    });

    it("honors an HTTP-date Retry-After within the cap", async () => {
      const now = Date.UTC(2026, 9, 23, 0, 0, 0);
      jest.spyOn(Date, "now").mockReturnValue(now);
      mockResponses(failure(429, new Date(now + 5000).toUTCString()), ok(1));

      await service.createComment(params, DEFAULT_CREDENTIALS);

      expect(waitSpy).toHaveBeenCalledWith(5000);
    });

    it("retries when Retry-After equals the 10s cap", async () => {
      mockResponses(failure(429, "10"), ok(1));

      await expect(service.createComment(params, DEFAULT_CREDENTIALS)).resolves.toEqual({ id: 1 });
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(waitSpy).toHaveBeenCalledWith(10000);
    });

    it("does not retry when Retry-After is just above the 10s cap", async () => {
      mockResponses(failure(429, "11"), ok(1));

      await expect(service.createComment(params, DEFAULT_CREDENTIALS)).rejects.toThrow(
        "Bitbucket API error 429",
      );
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(waitSpy).not.toHaveBeenCalled();
    });

    it("does not retry when Retry-After exceeds the 10s cap", async () => {
      mockResponses(failure(429, "3600"), ok(1));

      await expect(
        service.createComment(params, DEFAULT_CREDENTIALS),
      ).rejects.toThrow("Bitbucket API error 429");
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(waitSpy).not.toHaveBeenCalled();
    });

    it("falls back on 401 and then retries 429 on the next auth header", async () => {
      const captured = mockResponses(
        { ok: false, status: 401, text: async () => "expired" },
        failure(429),
        ok(1),
      );

      await expect(
        service.createComment(params, {
          apiTokens: ["repo-token", "global-token"],
        }),
      ).resolves.toEqual({ id: 1 });
      expect(captured).toEqual([
        "Bearer repo-token",
        "Bearer global-token",
        "Bearer global-token",
      ]);
    });

    it.each([400, 401, 404, 500])(
      "does not retry status %i",
      async (status) => {
        mockResponses(failure(status), ok(1));

        await expect(
          service.createComment(params, DEFAULT_CREDENTIALS),
        ).rejects.toThrow(`Bitbucket API error ${status}`);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(waitSpy).not.toHaveBeenCalled();
      },
    );

    it("retries inline comments on 429", async () => {
      mockResponses(failure(429), ok(12));

      await expect(
        service.createInlineComment(
          { ...params, filePath: "src/app.ts", line: 42 },
          DEFAULT_CREDENTIALS,
        ),
      ).resolves.toEqual({ id: 12 });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("does not retry thrown network errors", async () => {
      global.fetch = jest.fn().mockRejectedValue(new TypeError("fetch failed"));

      await expect(
        service.createComment(params, DEFAULT_CREDENTIALS),
      ).rejects.toThrow("fetch failed");
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(waitSpy).not.toHaveBeenCalled();
    });
  });
});
