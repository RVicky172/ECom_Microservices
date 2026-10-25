/**
 * Unit tests for the handoff-claim guard (012 T034, D-048): a reply that says the customer is being connected,
 * when no handoff tool ran, gets a correction.
 */
import { describe, expect, it } from 'vitest';
import { claimsConnecting, HANDOFF_CORRECTION, handoffCorrection } from './handoffGuard';

describe('claimsConnecting', () => {
  it.each([
    "I'll connect you with a person right away. Please wait a moment.",
    "I'll connect you with a person. Please wait.",
    'I will connect you to our support team now.',
    "I'm connecting you with someone who can help.",
    'Connecting you to a person now, one moment.',
    'Let me transfer you to a member of our team.',
    "I'll put you through to a human agent.",
    'I’ll get you in touch with our support team.',
  ])('flags a commitment to connect: %s', (text) => {
    expect(claimsConnecting(text)).toBe(true);
  });

  it.each([
    'Would you like me to connect you with a person?',
    'I can connect you with a person if you like.',
    'Shall I connect you with our support team?',
    "I couldn't connect you with a person right now. Please try again later.",
    'Do you want me to put you through to someone?',
    'Here are our keyboards.',
  ])('does not flag an offer, a failure or anything else: %s', (text) => {
    expect(claimsConnecting(text)).toBe(false);
  });
});

describe('handoffCorrection', () => {
  const claim = "I'll connect you with a person right away. Please wait a moment.";

  it('corrects a claim when the handoff tool did not run', () => {
    expect(handoffCorrection(claim, ['search_products'])).toBe(HANDOFF_CORRECTION);
    expect(handoffCorrection(claim, [])).toBe(HANDOFF_CORRECTION);
  });

  it('leaves the reply alone when the handoff tool ran, or when there is no claim', () => {
    expect(handoffCorrection(claim, ['request_human_handoff'])).toBeNull();
    expect(handoffCorrection('Would you like me to connect you with a person?', [])).toBeNull();
  });

  it('says plainly that nobody was contacted and offers to connect them now', () => {
    expect(HANDOFF_CORRECTION).toMatch(/haven't contacted/i);
    expect(HANDOFF_CORRECTION).toMatch(/would you like me to connect you with a person now\?/i);
  });
});
