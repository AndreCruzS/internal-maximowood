import { describe, expect, it } from "vitest";
import { renderEmail, sendMail } from "./email";

describe("intranet emails", () => {
  it("leaves out empty details and escapes what people typed", () => {
    const { text, html } = renderEmail({ title: "New hire", intro: "Set up accounts", rows: [["Name", "Jo <b>"], ["Phone", ""]], link: "https://x/y", linkLabel: "Open" });
    expect(text).toContain("Name: Jo <b>");
    expect(text).not.toContain("Phone");
    expect(html).toContain("Jo &lt;b&gt;");
  });
  it("skips sending when email isn't configured", async () => {
    delete process.env.SMTP_USER;
    expect((await sendMail({ to: "a@b.com", subject: "s", text: "t", html: "h" })).status).toBe("skipped");
  });
});
