import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const checkoutResponseSchema = z.object({
  result: z.string().optional(),
  resultcode: z.string().optional(),
  message: z.string().optional(),
  data: z.array(z.object({
    payment_gateway_url: z.string().url().optional(),
    order_id: z.string().optional()
  })).optional()
});

type CheckoutOrder = {
  order_id: string;
  buyer_email: string;
  buyer_name: string;
  buyer_phone: string;
  amount: number;
  currency: "TZS";
  redirect_url: string;
  cancel_url: string;
  webhook: string;
  no_of_items: number;
};

function requiredSetting(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to use Selcom payments.`);
  return value;
}

function signedDigest(
  fields: Record<string, string | number>,
  timestamp: string,
  signedFields: string[],
  secret: string
): string {
  const signingString = [
    `timestamp=${timestamp}`,
    ...signedFields.map((field) => `${field}=${fields[field]}`)
  ].join("&");
  return createHmac("sha256", secret).update(signingString).digest("base64");
}

export async function createSelcomCheckout(order: CheckoutOrder): Promise<string> {
  const apiKey = requiredSetting("SELCOM_API_KEY");
  const apiSecret = requiredSetting("SELCOM_API_SECRET");
  const vendor = requiredSetting("SELCOM_VENDOR");
  const baseUrl = requiredSetting("SELCOM_BASE_URL");
  const path = process.env.SELCOM_CREATE_ORDER_PATH || "/v1/checkout/create-order";

  if (order.order_id.length > 50) throw new Error("Selcom order reference is too long.");
  const payload = { vendor, ...order };
  const signedFields = Object.keys(payload);
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const digest = signedDigest(payload, timestamp, signedFields, apiSecret);
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `SELCOM ${Buffer.from(apiKey).toString("base64")}`,
      "Digest-Method": "HS256",
      Digest: digest,
      Timestamp: timestamp,
      "Signed-Fields": signedFields.join(",")
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000)
  });

  const raw = await response.text();
  if (!response.ok) {
    console.error("Selcom checkout creation failed", { status: response.status, body: raw.slice(0, 500) });
    throw new Error("Selcom did not accept the payment request.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Selcom returned an unrecognized response.");
  }
  const result = checkoutResponseSchema.safeParse(parsed);
  const checkoutUrl = result.data?.data?.[0]?.payment_gateway_url;
  if (!result.success || !checkoutUrl || !["SUCCESS", "000"].includes(result.data?.result || result.data?.resultcode || "")) {
    throw new Error(`Selcom did not return a payment link: ${result.success ? result.data.message || "incomplete response" : "invalid response structure"}.`);
  }
  return checkoutUrl;
}

export function verifySelcomCallback(
  rawBody: string,
  headers: Headers,
  now: Date = new Date()
): Record<string, unknown> | null {
  const apiSecret = process.env.SELCOM_API_SECRET;
  const digest = headers.get("digest");
  const digestMethod = headers.get("digest-method");
  const timestamp = headers.get("timestamp");
  const signedFieldsHeader = headers.get("signed-fields");
  if (!apiSecret || !digest || digestMethod !== "HS256" || !timestamp || !signedFieldsHeader) return null;

  const parsedTime = Date.parse(timestamp);
  if (!Number.isFinite(parsedTime) || Math.abs(now.getTime() - parsedTime) > 5 * 60 * 1000) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const fields = payload as Record<string, unknown>;
  const signedFields = signedFieldsHeader.split(",").map((field) => field.trim()).filter(Boolean);
  const hasEventId = signedFields.includes("transid") || signedFields.includes("transaction_id");
  const hasResult = signedFields.includes("result") || signedFields.includes("resultcode");
  if (
    !signedFields.includes("order_id") ||
    !signedFields.includes("amount") ||
    !hasEventId ||
    !hasResult ||
    signedFields.length === 0
  ) return null;
  if (signedFields.some((field) => typeof fields[field] !== "string" && typeof fields[field] !== "number")) return null;

  const canonicalFields = Object.fromEntries(
    signedFields.map((field) => [field, fields[field] as string | number])
  );
  const expected = Buffer.from(signedDigest(canonicalFields, timestamp, signedFields, apiSecret), "base64");
  const provided = Buffer.from(digest, "base64");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  return fields;
}
