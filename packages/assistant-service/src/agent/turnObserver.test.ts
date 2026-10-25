import { describe, expect, it, vi } from 'vitest';
import type { AssistantEvent } from './events';
import { TurnObserver } from './turnObserver';

const proposal: AssistantEvent = {
  type: 'proposal',
  proposal: { id: 'p-1', action: 'add', product: { id: 'prod-1', name: 'Mouse', price: 25 }, quantity: 1 },
};
const handoff: AssistantEvent = { type: 'handoff', reference: 'HO-ABCD1234', alreadyRequested: false };
const running = (tool: string): AssistantEvent => ({ type: 'tool_status', tool, state: 'running' });
const settled = (tool: string, state: 'done' | 'error' = 'done'): AssistantEvent => ({ type: 'tool_status', tool, state });

/** Plays events through a wrapped emit, as the controller does. */
const observe = (events: AssistantEvent[]) => {
  const observer = new TurnObserver();
  const forwarded: AssistantEvent[] = [];
  const emit = observer.wrap((event) => forwarded.push(event));
  events.forEach(emit);
  return { observer, forwarded };
};

describe('TurnObserver', () => {
  it('forwards every event unchanged and in order', () => {
    const events: AssistantEvent[] = [{ type: 'start', conversationId: 'c-1' }, { type: 'text', delta: 'Hi' }, running('search_products')];
    expect(observe(events).forwarded).toEqual(events);
  });

  it('records tool names in call order from `running` only, repeats included', () => {
    const { observer } = observe([
      running('search_products'),
      settled('search_products'),
      running('get_product'),
      settled('get_product', 'error'),
      running('search_products'),
      settled('search_products'),
    ]);
    expect(observer.tools).toEqual(['search_products', 'get_product', 'search_products']);
  });

  it('returns a copy of the tool list, so callers cannot change what it recorded', () => {
    const { observer } = observe([running('list_orders')]);
    observer.tools.push('changed');
    expect(observer.tools).toEqual(['list_orders']);
  });

  describe('outcome', () => {
    it('is `answered` for a plain reply', () => {
      expect(observe([{ type: 'text', delta: 'Hello' }]).observer.outcome('end_turn')).toBe('answered');
    });

    it('is `proposal` when a cart proposal was returned', () => {
      expect(observe([running('propose_add_to_cart'), proposal]).observer.outcome('end_turn')).toBe('proposal');
    });

    it('is `handoff` over `proposal`', () => {
      expect(observe([proposal, handoff]).observer.outcome('end_turn')).toBe('handoff');
    });

    it('is `handoff` for a repeat request too (the turn was about a handoff)', () => {
      const repeat: AssistantEvent = { ...handoff, alreadyRequested: true } as AssistantEvent;
      expect(observe([repeat]).observer.outcome('stop')).toBe('handoff');
    });

    it('is `refused` over `handoff` and `proposal` when the model refused', () => {
      expect(observe([proposal, handoff]).observer.outcome('refusal')).toBe('refused');
    });

    it('is `limited` for the pre-flight rate limit', () => {
      const { observer } = observe([{ type: 'error', code: 'rate_limited', message: 'slow down' }]);
      expect(observer.outcome(null)).toBe('limited');
    });

    it.each(['assistant_unavailable', 'busy', 'conversation_full', 'not_configured'] as const)(
      'is `error` for %s, whatever else happened in the turn',
      (code) => {
        const { observer } = observe([proposal, handoff, { type: 'error', code, message: 'x' }]);
        expect(observer.outcome('refusal')).toBe('error');
      },
    );

    it('exposes the error code it saw, or null', () => {
      expect(observe([{ type: 'error', code: 'busy', message: 'x' }]).observer.errorCode).toBe('busy');
      expect(observe([{ type: 'text', delta: 'ok' }]).observer.errorCode).toBeNull();
    });
  });

  it('does not throw for an event type it does not track', () => {
    const emit = vi.fn();
    const observer = new TurnObserver();
    expect(() => observer.wrap(emit)({ type: 'products', items: [] })).not.toThrow();
    expect(emit).toHaveBeenCalledOnce();
  });
});
