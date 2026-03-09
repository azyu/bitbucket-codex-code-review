import { TriggerService } from "./trigger.service";

jest.mock("@lib/logger", () => ({
  ServiceLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  })),
}));

describe("TriggerService", () => {
  let service: TriggerService;

  beforeEach(() => {
    service = new TriggerService();
  });

  it("should return true for @codex mention", () => {
    expect(service.hasCodexMention("@codex")).toBe(true);
  });

  it("should return true for @codex review mention", () => {
    expect(service.hasCodexMention("@codex review")).toBe(true);
  });

  it("should return false when there is no mention", () => {
    expect(service.hasCodexMention("please review this PR")).toBe(false);
  });

  it("should be case insensitive (@Codex returns true)", () => {
    expect(service.hasCodexMention("@Codex")).toBe(true);
  });

  it("should return true when mention is in the middle of text", () => {
    expect(
      service.hasCodexMention("Hey @codex review this change please"),
    ).toBe(true);
  });

  it("should return false for partial match like @codex-bot", () => {
    expect(service.hasCodexMention("@codex-bot")).toBe(false);
  });
});
