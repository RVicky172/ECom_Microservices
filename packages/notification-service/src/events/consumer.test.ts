import { KafkaTopics, parseHandoffRequested } from '@ecommerce/shared';
import type { SagaEnvelope } from '@ecommerce/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as notificationService from '../services/notificationService';
import { handleNotificationEvent } from './consumer';

vi.mock('../services/notificationService', () => ({
  sendOrderCreatedEmail: vi.fn(async () => undefined),
  sendPaymentSuccessEmail: vi.fn(async () => undefined),
  sendPaymentFailedEmail: vi.fn(async () => undefined),
  sendSupportHandoffEmail: vi.fn(async () => undefined),
}));

const service = vi.mocked(notificationService);
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const ORDER_ID = '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16';
const USER_ID = '16be8435-63db-4cd3-9c33-e8de62839df2';
const items = [{ productId: '6aa90ece96384c76af92529b', quantity: 1 }];
const handoff = {
  reference: 'HO-1A2B3C4D',
  userId: USER_ID,
  conversationId: 'b0c5d1a2-0a8e-4a3f-9a57-0d0c2e7b9f11',
  reason: 'customer_request',
  summary: 'Wants to talk to a person about a late order.',
  requestedAt: '2026-10-23T12:00:00.000Z',
};

// Event IDs are unique per test: the handler remembers processed IDs for the life of the module.
let nextId = 0;
const envelope = (data: unknown, eventId = `e-${++nextId}`): SagaEnvelope => ({
  eventId,
  eventType: 'X',
  aggregateId: 'a',
  data,
  timestamp: '2026-10-23T12:00:00.000Z',
});

describe('notification event handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends one support email for a handoff, with the parsed payload (contract)', async () => {
    await handleNotificationEvent(KafkaTopics.ASSISTANT_HANDOFF_REQUESTED, envelope(handoff), 'corr-1', logger);
    expect(service.sendSupportHandoffEmail.mock.calls).toEqual([[parseHandoffRequested(handoff), logger]]);
  });

  it('sends nothing more when the same handoff event arrives again', async () => {
    const event = envelope(handoff);
    await handleNotificationEvent(KafkaTopics.ASSISTANT_HANDOFF_REQUESTED, event, 'corr-1', logger);
    await handleNotificationEvent(KafkaTopics.ASSISTANT_HANDOFF_REQUESTED, { ...event }, 'corr-1', logger);
    expect(service.sendSupportHandoffEmail).toHaveBeenCalledTimes(1);
  });

  it('logs an unreadable handoff payload as an error without throwing or sending', async () => {
    const { summary: _missing, ...unreadable } = handoff;
    await expect(
      handleNotificationEvent(KafkaTopics.ASSISTANT_HANDOFF_REQUESTED, envelope(unreadable), 'corr-1', logger),
    ).resolves.toBeUndefined();
    expect(service.sendSupportHandoffEmail).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.error.mock.calls[0])).toContain('summary missing or invalid');
  });

  it('logs no message text beyond the IDs when receiving an event', async () => {
    await handleNotificationEvent(KafkaTopics.ASSISTANT_HANDOFF_REQUESTED, envelope(handoff), 'corr-1', logger);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(handoff.summary);
  });

  it.each([
    [KafkaTopics.ORDER_CREATED, { orderId: ORDER_ID, userId: USER_ID, items, totalAmount: 25 }, 'sendOrderCreatedEmail'],
    [KafkaTopics.PAYMENT_COMPLETED, { orderId: ORDER_ID, items, amount: 25 }, 'sendPaymentSuccessEmail'],
    [KafkaTopics.PAYMENT_FAILED, { orderId: ORDER_ID, items, amount: 25, reason: 'PAYMENT_DECLINED' }, 'sendPaymentFailedEmail'],
  ] as const)('still routes %s', async (topic, data, method) => {
    await handleNotificationEvent(topic, envelope(data), 'corr-1', logger);
    expect(service[method]).toHaveBeenCalledTimes(1);
    expect(service.sendSupportHandoffEmail).not.toHaveBeenCalled();
  });
});

describe('support handoff email', () => {
  it('logs one line naming the reference, user, conversation, reason and summary', async () => {
    const { sendSupportHandoffEmail } = await vi.importActual<typeof notificationService>('../services/notificationService');
    const log = { info: vi.fn() };
    await sendSupportHandoffEmail(parseHandoffRequested(handoff), log);
    expect(log.info.mock.calls).toEqual([
      [
        { reference: handoff.reference, userId: USER_ID, conversationId: handoff.conversationId, reason: 'customer_request' },
        `[EMAIL SENT] To support: handoff HO-1A2B3C4D from user ${USER_ID} (conversation ${handoff.conversationId}), ` +
          'reason customer_request: Wants to talk to a person about a late order.',
      ],
    ]);
  });
});
