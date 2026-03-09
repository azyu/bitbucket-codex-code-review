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

  describe("shouldAutoReview", () => {
    it.each([
      ["pullrequest:created", "auto", true],
      ["pullrequest:updated", "auto", true],
      ["pullrequest:created", "both", true],
      ["pullrequest:updated", "both", true],
      ["pullrequest:created", "mention", false],
      ["pullrequest:updated", "mention", false],
      ["pullrequest:comment_created", "auto", false],
      ["pullrequest:comment_created", "both", false],
    ])(
      "event=%s, mode=%s → %s",
      (eventKey, triggerMode, expected) => {
        expect(service.shouldAutoReview(eventKey, triggerMode)).toBe(expected);
      },
    );
  });

  describe("shouldMentionReview", () => {
    it.each([
      ["mention", true],
      ["both", true],
      ["auto", false],
    ])("mode=%s → %s", (triggerMode, expected) => {
      expect(service.shouldMentionReview(triggerMode)).toBe(expected);
    });
  });
});
