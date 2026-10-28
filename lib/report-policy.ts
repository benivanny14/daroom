/** Number of independent reports in the window before a listing is flagged. */
export function reportFlagThreshold(): number {
  const value = Number(process.env.REPORT_FLAG_THRESHOLD);
  return Number.isSafeInteger(value) && value > 0 ? value : 3;
}

/** Reports older than this window no longer count towards auto-flagging. */
export const REPORT_WINDOW_DAYS = 30;
