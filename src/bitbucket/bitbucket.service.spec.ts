import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BitbucketService } from "./bitbucket.service";

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

      await service.createComment(commentParams);

      expect(captured[0]).toBe("Bearer repo-token-123");
    });

    it("falls back to global apiToken when no repo token", async () => {
      const service = await createService({
        "bitbucket.repoTokens": { "other-repo": "other-token" },
        "bitbucket.apiToken": "global-token",
      });
      const captured: string[] = [];
      mockFetch(captured);

      await service.createComment(commentParams);

      expect(captured[0]).toBe("Bearer global-token");
    });

    it("falls back to Basic auth when no tokens exist", async () => {
      const service = await createService({
        "bitbucket.username": "myuser",
        "bitbucket.appPassword": "mypass",
      });
      const captured: string[] = [];
      mockFetch(captured);

      await service.createComment(commentParams);

      const expected = `Basic ${Buffer.from("myuser:mypass").toString("base64")}`;
      expect(captured[0]).toBe(expected);
    });

    it("returns Basic header with empty creds when nothing configured", async () => {
      const service = await createService({});
      const captured: string[] = [];
      mockFetch(captured);

      await service.createComment(commentParams);

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

      await service.createComment(commentParams);

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

      await expect(service.createComment(commentParams)).resolves.toEqual({
        id: 1,
      });
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

      await expect(service.createComment(commentParams)).rejects.toThrow(
        "Bitbucket API error 401: expired",
      );
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
        service.replyToComment({ ...baseParams, parentCommentId: 99 }),
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
        }),
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

      await expect(service.createComment(baseParams)).rejects.toThrow(
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
        service.replyToComment({ ...baseParams, parentCommentId: 99 }),
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
        }),
      ).rejects.toThrow(
        "Bitbucket inline comment API error 400: invalid line",
      );
    });
  });
});
