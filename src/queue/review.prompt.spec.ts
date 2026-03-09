import { buildReviewPrompt } from "./review.prompt";

describe("buildReviewPrompt", () => {
  const prompt = buildReviewPrompt("main");

  it("should include baseBranch in the prompt", () => {
    expect(prompt).toContain("'main'");
  });

  it("should include false positive prevention rules", () => {
    expect(prompt).toContain("기존 코드");
    expect(prompt).toContain("의도적인 변경");
    expect(prompt).toContain("추측 금지");
    expect(prompt).toContain("주관적 의견 제외");
  });

  it("should include tone guidelines", () => {
    expect(prompt).toContain("matter-of-fact");
    expect(prompt).toContain("칭찬/사교적 표현 금지");
    expect(prompt).toContain("1문단");
  });

  it("should include new fields in JSON schema", () => {
    expect(prompt).toContain("endLine");
    expect(prompt).toContain("title");
    expect(prompt).toContain('"confidence"');
  });

  it("should include severity and verdict guidelines", () => {
    expect(prompt).toContain("blocking");
    expect(prompt).toContain("approve");
    expect(prompt).toContain("request-changes");
  });

  it("should use different baseBranch values", () => {
    const devPrompt = buildReviewPrompt("develop");
    expect(devPrompt).toContain("'develop'");
    expect(devPrompt).not.toContain("'main'");
  });
});
