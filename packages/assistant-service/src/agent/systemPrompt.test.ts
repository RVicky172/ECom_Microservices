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

  it('hands off in the same turn the customer asks, without asking what it is about first (T035)', () => {
    expect(prompt).toMatch(/only for requests to talk to a person: call request_human_handoff straight away, before writing anything/i);
    expect(prompt).toMatch(/don't ask what it's about first/i);
    expect(prompt).toMatch(/never say you are connecting them .* unless the tool/i);
    expect(prompt).toMatch(/after the tool result, always reply with the reference/i);
    // "…a person about my order" kept getting "Could you give me the order reference?" (T034, T035). The example
    // is a different phrase on purpose, so the live check on the original one stays a fair test.
    expect(prompt).toMatch(/"I want to speak to someone about my refund".*call request_human_handoff/i);
    expect(prompt).not.toContain('about my order');
    // A sample reference in the prompt was copied into a reply with no handoff behind it (T035 attempt 3).
    expect(prompt).not.toMatch(/HO-[0-9A-F]{8}/);
    expect(prompt).toMatch(/never make up a reference/i);
  });

  it('makes product answers come from a catalog lookup, never from memory (T035)', () => {
    // The handoff rule made Qwen3 answer "Do you have any wireless mice?" with invented brands and no tool call.
    expect(prompt).toMatch(/before naming, recommending or describing any product, call search_products or get_product/i);
    expect(prompt).toMatch(/never name a product, brand or price that a tool did not return/i);
    // A vague question ("Do you have a keyboard?") got invented brands. The example uses another product on purpose,
    // so the live check on the keyboard question stays a fair test.
    expect(prompt).toMatch(/"Do you have headphones\?".*call search_products/i);
    expect(prompt).not.toMatch(/do you have a keyboard/i);
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
