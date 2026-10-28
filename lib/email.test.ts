import { afterEach, describe, expect, it, vi } from "vitest";
import { emailConfigured } from "./email";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("email configuration", () => {
  it("treats the Resend sandbox sender as not configured", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "DarRoom <onboarding@resend.dev>");
    expect(emailConfigured()).toBe(false);
  });

  it("accepts a sender on a verified domain", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "DarRoom <no-reply@darroom.co.tz>");
    expect(emailConfigured()).toBe(true);
  });

  it("stays disabled when the key or sender is missing", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "DarRoom <no-reply@darroom.co.tz>");
    expect(emailConfigured()).toBe(false);
  });
});
