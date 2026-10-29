import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SonicPesaError,
  createSonicPesaOrder,
  mapSonicPesaStatus,
  verifySonicPesaWebhook
} from "./sonicpesa";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("SonicPesa status mapping", () => {
  it("maps provider states to the local payment states", () => {
    expect(mapSonicPesaStatus("SUCCESS")).toBe("PAID");
    expect(mapSonicPesaStatus("COMPLETED")).toBe("PAID");
    expect(mapSonicPesaStatus("PENDING")).toBe("PENDING");
    expect(mapSonicPesaStatus("INPROGRESS")).toBe("PENDING");
    expect(mapSonicPesaStatus("REJECTED")).toBe("FAILED");
    expect(mapSonicPesaStatus("USERCANCELLED")).toBe("CANCELLED");
    expect(mapSonicPesaStatus(null)).toBe("PENDING");
  });
});

describe("SonicPesa webhook signature", () => {
  const secret = "test-secret-key";
  const body = JSON.stringify({ event: "payment.success", order_id: "sp_test" });

  it("accepts a valid hex HMAC", () => {
    vi.stubEnv("SONICPESA_SECRET_KEY", secret);
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifySonicPesaWebhook(body, signature)).toBe(true);
  });

  it("accepts a valid base64 HMAC as a fallback", () => {
    vi.stubEnv("SONICPESA_SECRET_KEY", secret);
    const signature = createHmac("sha256", secret).update(body).digest("base64");
    expect(verifySonicPesaWebhook(body, signature)).toBe(true);
  });

  it("rejects missing, malformed and tampered signatures", () => {
    vi.stubEnv("SONICPESA_SECRET_KEY", secret);
    expect(verifySonicPesaWebhook(body, null)).toBe(false);
    expect(verifySonicPesaWebhook(body, "not-a-signature")).toBe(false);
    expect(verifySonicPesaWebhook(body, "0".repeat(64))).toBe(false);
    expect(verifySonicPesaWebhook(`${body} `, createHmac("sha256", secret).update(body).digest("hex"))).toBe(false);
  });
});

describe("SonicPesa create order", () => {
  it("sends the documented headers and payload", async () => {
    vi.stubEnv("SONICPESA_ACCESS_KEY", "sk_test_access");
    vi.stubEnv("SONICPESA_SECRET_KEY", "sk_test_secret");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          message: "Payment order created successfully! Push USSD sent to your phone.",
          data: {
            order_id: "sp_123",
            reference: "S20467752501",
            amount: 50000,
            currency: "TZS",
            payment_status: "PENDING",
            status: "PENDING",
            transid: null,
            channel: null,
            msisdn: "255712345678"
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const order = await createSonicPesaOrder({
      buyerName: "Test Tenant",
      buyerEmail: "tenant@example.com",
      buyerPhone: "255712345678",
      amountTzs: 50000
    });

    expect(order.orderId).toBe("sp_123");
    expect(order.status).toBe("PENDING");
    expect(order.providerReference).toBe("S20467752501");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.sonicpesa.com/api/v1/payment/create_order");
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-KEY"]).toBe("sk_test_access");
    expect(init.headers["X-SECRET-KEY"]).toBe("sk_test_secret");
    expect(JSON.parse(init.body)).toEqual({
      buyer_email: "tenant@example.com",
      buyer_name: "Test Tenant",
      buyer_phone: "255712345678",
      amount: 50000,
      currency: "TZS"
    });
  });

  it("rejects an order the provider did not create", async () => {
    vi.stubEnv("SONICPESA_ACCESS_KEY", "sk_test_access");
    vi.stubEnv("SONICPESA_SECRET_KEY", "sk_test_secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "error", message: "Invalid phone number" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await expect(
      createSonicPesaOrder({
        buyerName: "Test Tenant",
        buyerEmail: "tenant@example.com",
        buyerPhone: "255712345678",
        amountTzs: 50000
      })
    ).rejects.toThrow("Invalid phone number");
  });

  it("surfaces the provider's rejection message instead of a generic failure", async () => {
    vi.stubEnv("SONICPESA_ACCESS_KEY", "sk_test_access");
    vi.stubEnv("SONICPESA_SECRET_KEY", "sk_test_secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "error",
            message: "The balance of customer is not enough for the payment",
            resultcode: "9009"
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const error = await createSonicPesaOrder({
      buyerName: "Test Tenant",
      buyerEmail: "tenant@example.com",
      buyerPhone: "255712345678",
      amountTzs: 50000
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SonicPesaError);
    expect((error as SonicPesaError).message).toBe(
      "The balance of customer is not enough for the payment"
    );
    expect((error as SonicPesaError).status).toBe(402);
  });

  it("keeps a provider outage as a generic failure", async () => {
    vi.stubEnv("SONICPESA_ACCESS_KEY", "sk_test_access");
    vi.stubEnv("SONICPESA_SECRET_KEY", "sk_test_secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("upstream exploded", { status: 503, headers: { "Content-Type": "text/plain" } })
      )
    );

    const error = await createSonicPesaOrder({
      buyerName: "Test Tenant",
      buyerEmail: "tenant@example.com",
      buyerPhone: "255712345678",
      amountTzs: 50000
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SonicPesaError);
    expect((error as SonicPesaError).message).toBe("SonicPesa did not accept the payment request.");
    expect((error as SonicPesaError).status).toBe(502);
  });

  it("refuses amounts outside the allowed range before calling the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createSonicPesaOrder({
        buyerName: "Test Tenant",
        buyerEmail: "tenant@example.com",
        buyerPhone: "255712345678",
        amountTzs: 999
      })
    ).rejects.toThrow("between TSh 1,000");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
