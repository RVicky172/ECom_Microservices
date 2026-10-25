/**
 * Guard against a false handoff claim (012 T034, D-048). The local model sometimes replies "I'll connect you with a
 * person, please wait" without calling `request_human_handoff`, so nobody is contacted. Prompt rules didn't stop
 * it, so the chat controller checks each finished turn and, for such a claim, adds a correction.
 */

/** The tool whose call makes a "connecting you" reply true. */
const HANDOFF_TOOL = 'request_human_handoff';

/** Appended to a false claim. The reply has already streamed, so it can only be corrected, not replaced. */
export const HANDOFF_CORRECTION =
  "\n\nSorry, I haven't contacted our support team yet. Would you like me to connect you with a person now?";

/** Phrases that commit to connecting the customer now ("I'll connect you", "connecting you"). */
const COMMITMENTS = [
  /\b(i'll|i will|i'm|i am|let me)\s+(now\s+)?(connect|connecting|transfer|transferring)\s+you\b/,
  /\b(i'll|i will|let me)\s+(put|get)\s+you\s+(through|in touch|connected)\b/,
  /^connecting you\b|[.!?]\s*connecting you\b/,
];

/**
 * True when the reply says the customer is being connected to a person. Offers ("would you like me to connect
 * you?") and failures ("I couldn't connect you") are not claims.
 */
export function claimsConnecting(reply: string): boolean {
  const text = reply.toLowerCase().replace(/[‘’]/g, "'").trim();
  return COMMITMENTS.some((pattern) => pattern.test(text));
}

/**
 * The correction for this turn, or null when none is needed: the reply claims a connection but the handoff tool
 * didn't run.
 *
 * @param tools the tools the turn called, in order
 */
export function handoffCorrection(reply: string, tools: string[]): string | null {
  return claimsConnecting(reply) && !tools.includes(HANDOFF_TOOL) ? HANDOFF_CORRECTION : null;
}
