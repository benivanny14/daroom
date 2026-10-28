import { Resend } from "resend";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY and EMAIL_FROM are required in production.");
    }
    console.info(`[email preview] To: ${input.to}; Subject: ${input.subject}\n${input.text}`);
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, ...input });
  if (error) throw new Error(`Email provider rejected the message: ${error.message}`);
}

export async function sendActionLink(input: {
  to: string;
  name: string;
  url: string;
  purpose: "verify" | "reset";
}): Promise<void> {
  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(input.url);
  const verify = input.purpose === "verify";
  const action = verify ? "verify your email" : "set a new password";
  await sendEmail({
    to: input.to,
    subject: verify ? "Verify your DarRoom account" : "Reset your DarRoom password",
    text: `Hello ${input.name}, open this link to ${action}: ${input.url}. The link expires in one hour.`,
    html: `<p>Hello ${safeName},</p><p><a href="${safeUrl}">Click here to ${action}</a>.</p><p>The link expires in one hour.</p>`
  });
}

export async function sendExpiryReminder(input: {
  to: string;
  name: string;
  renewUrl: string;
}): Promise<void> {
  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(input.renewUrl);
  await sendEmail({
    to: input.to,
    subject: "Your DarRoom subscription expires in 3 days",
    text: `Hello ${input.name}. Your plan expires in 3 days. Pay TSh 5,000 to keep promoting your rooms: ${input.renewUrl}`,
    html: `<p>Hello ${safeName},</p><p>Your plan expires in 3 days. Pay TSh 5,000 to keep promoting your rooms.</p><p><a href="${safeUrl}">Extend your subscription</a></p>`
  });
}

export async function sendNewListingNotification(input: {
  to: string;
  name: string;
  listingTitle: string;
  dashboardUrl: string;
}): Promise<void> {
  const safeName = escapeHtml(input.name);
  const safeTitle = escapeHtml(input.listingTitle);
  const safeUrl = escapeHtml(input.dashboardUrl);
  await sendEmail({
    to: input.to,
    subject: `Your listing: ${input.listingTitle}`,
    text: `Hello ${input.name}. Your listing "${input.listingTitle}" is now live and visible to tenants. View your dashboard: ${input.dashboardUrl}`,
    html: `<p>Hello ${safeName},</p><p>Your listing "${safeTitle}" is now live and visible to tenants.</p><p><a href="${safeUrl}">View your dashboard</a></p>`
  });
}

export async function sendViewingReminder(input: {
  to: string;
  name: string;
  listingTitle: string;
  date: string;
}): Promise<void> {
  const safeName = escapeHtml(input.name);
  const safeTitle = escapeHtml(input.listingTitle);
  const safeDate = escapeHtml(input.date);
  await sendEmail({
    to: input.to,
    subject: `Reminder: Property viewing - ${input.listingTitle}`,
    text: `Hello ${input.name}. You have a viewing for "${input.listingTitle}" tomorrow (${input.date}). Please remember to arrive on time.`,
    html: `<p>Hello ${safeName},</p><p>You have a viewing for "${safeTitle}" tomorrow (${safeDate}).</p><p>Please remember to arrive on time.</p>`
  });
}

export async function sendReportConfirmation(input: {
  to: string;
  name: string;
  listingTitle: string;
}): Promise<void> {
  const safeName = escapeHtml(input.name);
  const safeTitle = escapeHtml(input.listingTitle);
  await sendEmail({
    to: input.to,
    subject: "Your report has been submitted",
    text: `Hello ${input.name}. Thank you for reporting the listing "${input.listingTitle}". Our team will review it and get back to you shortly.`,
    html: `<p>Hello ${safeName},</p><p>Thank you for reporting the listing "${safeTitle}". Our team will review it and get back to you shortly.</p>`
  });
}

