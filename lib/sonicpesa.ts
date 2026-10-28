import { createHmac } from "node:crypto";
import { z } from "zod";
import { timingSafeCompare } from "./security";

/**
 * SonicPesa mobile-money gateway (M-Pesa, Tigo Pesa, Airtel Money, Halopesa).
 *
 * Docs: https://sonicpesa.com/docs
 * - POST /api/v1/payment/create_order  -> sends a USSD push to the buyer
 * - POST /api/v1/payment/order_status  -> polls an order
 * - Webhooks are signed with HMAC-SHA256 over the raw body using the secret key
 *   and sent in the `X-SonicPesa-Signature` header.
 */

const DEFAULT_BASE_URL = "https://api.sonicpesa.com";
const CREATE_ORDER_PATH = "/api/v1/payment/create_order";
const ORDER_STATUS_PATH = "/api/v1/payment/order_status";
const CREATE_ORDER_TIMEOUT_MS = 45_000;
const ORDER_STATUS_TIMEOUT_MS = 20_000;

export type SonicPesaPaymentState = "PENDING" | "PAID" | "FAILED" | "CANCELLED";

const orderSchema = z.object({
  status: z.string().optional(),
  message: z.string().optional(),
  data: z.object({
    order_id: z.string().min(1),
    reference: z.string().nullish(),
    amount: z.union([z.number(), z.string()]).nullish(),
    currency: z.string().nullish(),
    payment_status: z.string().nullish(),
    status: z.string().nullish(),
    transid: z.string().nullish(),
    channel: z.string().nullish(),
    msisdn: z.string().nullish()
  }).optional()
});

const statusSchema = z.object({
  status: z.string().optional(),
  message: z.string().optional(),
  data: z.object({
    order_id: z.string().optional(),
    payment_status: z.string().nullish(),
    status: z.string().nullish(),
    amount: z.union([z.number(), z.string()]).nullish(),
    currency: z.string().nullish(),
    transid: z.string().nullish(),
    reference: z.string().nullish(),
    channel: z.string().nullish(),
    msisdn: z.string().nullish()
  }).optional()
});

export class SonicPesaError extends Error {
  constructor(message: string, public readonly status: number = 502) {
    super(message);
    this.name = "SonicPesaError";
  }
}

export type SonicPesaOrder = {
  orderId: string;
  providerReference: string | null;
  amountTzs: number | null;
  currency: string;
  status: SonicPesaPaymentState;
  transId: string | null;
  channel: string | null;
  raw: Record<string, unknown>;
};

export function isSonicPesaConfigured(): boolean {
  return Boolean(process.env.SONICPESA_ACCESS_KEY && process.env.SONICPESA_SECRET_KEY);
}

function baseUrl(): string {
  return (process.env.SONICPESA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function authHeaders(): Record<string, string> {
  const accessKey = process.env.SONICPESA_ACCESS_KEY;
  const secretKey = process.env.SONICPESA_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new SonicPesaError("SonicPesa is not configured on this server.", 503);
  }
  return {
    "X-API-KEY": accessKey,
    "X-SECRET-KEY": secretKey,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
}

async function readProviderResponse(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!response.ok) {
    // Never log credentials; a short body snippet is enough to diagnose.
    console.error("SonicPesa request failed", { status: response.status, body: raw.slice(0, 300) });
    if (response.status === 401 || response.status === 403) {
      throw new SonicPesaError("SonicPesa rejected the merchant credentials.", 502);
    }
    throw new SonicPesaError("SonicPesa did not accept the payment request.", 502);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new SonicPesaError("SonicPesa returned an unrecognized response.", 502);
  }
}

function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

export function mapSonicPesaStatus(value: string | null | undefined): SonicPesaPaymentState {
  switch ((value || "").trim().toUpperCase()) {
    case "SUCCESS":
    case "COMPLETED":
    case "PAID":
      return "PAID";
    case "CANCELLED":
    case "CANCELED":
    case "USERCANCELLED":
      return "CANCELLED";
    case "REJECTED":
    case "FAILED":
    case "FAILURE":
      return "FAILED";
    default:
      // PENDING and INPROGRESS are both "waiting for the customer".
      return "PENDING";
  }
}

/**
 * Sends a USSD/STK-style push prompt to the buyer's phone. The buyer approves
 * it on their handset; the final result arrives by webhook (or by polling).
 */
export async function createSonicPesaOrder(input: {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  amountTzs: number;
}): Promise<SonicPesaOrder> {
  if (!Number.isInteger(input.amountTzs) || input.amountTzs < 1_000 || input.amountTzs > 10_000_000) {
    throw new SonicPesaError("The payment amount must be between TSh 1,000 and TSh 10,000,000.", 400);
  }
  if (!/^255[67]\d{8}$/.test(input.buyerPhone)) {
    throw new SonicPesaError("Enter a valid Tanzanian mobile-money number.", 400);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${CREATE_ORDER_PATH}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        buyer_email: input.buyerEmail,
        buyer_name: input.buyerName,
        buyer_phone: input.buyerPhone,
        amount: input.amountTzs,
        currency: "TZS"
      }),
      signal: AbortSignal.timeout(CREATE_ORDER_TIMEOUT_MS)
    });
  } catch (error) {
    if (error instanceof SonicPesaError) throw error;
    console.error("SonicPesa create_order network failure", error instanceof Error ? error.message : "unknown");
    throw new SonicPesaError("SonicPesa could not be reached. Try again.", 502);
  }

  const payload = await readProviderResponse(response);
  const parsed = orderSchema.safeParse(payload);
  if (!parsed.success || parsed.data.status?.toLowerCase() !== "success" || !parsed.data.data?.order_id) {
    console.error("SonicPesa create_order rejected", {
      status: parsed.success ? parsed.data.status : "invalid_response",
      message: parsed.success ? parsed.data.message : undefined
    });
    throw new SonicPesaError(
      parsed.success && parsed.data.message
        ? parsed.data.message
        : "SonicPesa did not create the payment order.",
      502
    );
  }

  const data = parsed.data.data;
  return {
    orderId: data.order_id,
    providerReference: data.reference || null,
    amountTzs: toAmount(data.amount),
    currency: data.currency || "TZS",
    status: mapSonicPesaStatus(data.payment_status || data.status),
    transId: data.transid || null,
    channel: data.channel || null,
    raw: payload as Record<string, unknown>
  };
}

/** Polls the provider when a webhook is delayed or the buyer asks for status. */
export async function getSonicPesaOrderStatus(orderId: string): Promise<SonicPesaOrder> {
  if (!orderId) throw new SonicPesaError("An order id is required.", 400);

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${ORDER_STATUS_PATH}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ order_id: orderId }),
      signal: AbortSignal.timeout(ORDER_STATUS_TIMEOUT_MS)
    });
  } catch (error) {
    if (error instanceof SonicPesaError) throw error;
    console.error("SonicPesa order_status network failure", error instanceof Error ? error.message : "unknown");
    throw new SonicPesaError("SonicPesa could not be reached. Try again.", 502);
  }

  const payload = await readProviderResponse(response);
  const parsed = statusSchema.safeParse(payload);
  if (!parsed.success || parsed.data.status?.toLowerCase() !== "success" || !parsed.data.data) {
    throw new SonicPesaError(
      parsed.success && parsed.data.message ? parsed.data.message : "SonicPesa did not return the order status.",
      502
    );
  }

  const data = parsed.data.data;
  return {
    orderId: data.order_id || orderId,
    providerReference: data.reference || null,
    amountTzs: toAmount(data.amount),
    currency: data.currency || "TZS",
    status: mapSonicPesaStatus(data.payment_status || data.status),
    transId: data.transid || null,
    channel: data.channel || null,
    raw: payload as Record<string, unknown>
  };
}

/**
 * Verifies the `X-SonicPesa-Signature` header. The docs specify a hex HMAC of
 * the raw request body using the secret key; base64 is accepted as a fallback.
 */
export function verifySonicPesaWebhook(rawBody: string, signature: string | null): boolean {
  const secret = process.env.SONICPESA_SECRET_KEY;
  if (!secret || !signature) return false;

  const provided = signature.trim();
  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  if (timingSafeCompare(provided.toLowerCase(), expectedHex)) return true;

  const expectedBase64 = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return timingSafeCompare(provided, expectedBase64);
}
