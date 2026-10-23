import { describe, expect, it } from 'vitest';
import { loadPolicies } from './policies';
import { buildSystemPrompt, SYSTEM_PROMPT } from './systemPrompt';

const POLICIES = '## Returns\n\n- Returns within 30 days of delivery.';
const prompt = buildSystemPrompt(POLICIES);

describe('buildSystemPrompt', () => {
  it('includes the policy document verbatim under a "Store policies" section', () => {
    expect(prompt).toContain('Store policies');
    expect(prompt).toContain(POLICIES);
  });

  it('tells the model to answer policy questions only from that section and offer a person otherwise', () => {
    expect(prompt).toMatch(/policy questions .*only from the store policies below/i);
    expect(prompt).toMatch(/say the store policies don't cover it, so you don't know/i);
    expect(prompt).toMatch(/offer to connect (them|the customer) with a person/i);
  });

  it('forbids answering an uncovered question with an invented "no" or extra conditions (T032)', () => {
    expect(prompt).toMatch(/do not say yes and do not say no/i);
    expect(prompt).toMatch(/including that the store does not offer something/i);
    expect(prompt).toMatch(/add no conditions, timings or details/i);
    expect(prompt).toMatch(/don't say when a time period starts/i);
  });

  it('treats a limit in the policies ("only") as an answer, not as "not covered" (T032)', () => {
    expect(prompt).toMatch(/a policy that sets a limit .* also answers questions about everything outside that limit/i);
  });

  it('allows the handoff tool only when the customer asks or agrees, once per conversation', () => {
    expect(prompt).toContain('request_human_handoff');
    expect(prompt).toMatch(/only when the customer asks .*person.* or says yes/i);
    expect(prompt).toMatch(/never on your own/i);
    expect(prompt).toMatch(/same reference/i);
  });

  it('keeps the existing instructions', () => {
    expect(prompt).toMatch(/^You are the shopping assistant for mercato/);
    expect(prompt).toContain('Never invent products, prices, specifications, policies or delivery dates.');
    expect(prompt).toContain('use propose_add_to_cart');
    expect(prompt).toContain('CANCELLED: stopped, usually because an item was out of stock or the payment failed.');
    expect(prompt).toContain('Refer to orders by their short reference');
  });

  it('is built once from the policy file for SYSTEM_PROMPT', () => {
    expect(SYSTEM_PROMPT).toBe(buildSystemPrompt(loadPolicies()));
  });
});
