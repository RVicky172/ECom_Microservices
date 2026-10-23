import { describe, expect, it } from 'vitest';
import { cancelReasonLabel, formatCurrency, getGreeting, getStatusClass } from './storePresentation';

describe('formatCurrency', () => {
  it.each([
    [12.5, '$12.50'],
    ['7', '$7.00'], // numeric strings come from the API
    [0, '$0.00'],
    ['not a number', '$0.00'],
  ])('formats %j as %s', (amount, expected) => {
    expect(formatCurrency(amount)).toBe(expected);
  });
});

describe('getStatusClass', () => {
  it.each([
    ['CONFIRMED', 'status status-success'],
    ['CANCELLED', 'status status-danger'],
    ['payment_failed', 'status status-danger'],
    ['PENDING', 'status status-pending'],
  ])('maps %s to %s', (status, expected) => {
    expect(getStatusClass(status)).toBe(expected);
  });
});

describe('getGreeting', () => {
  // Local-time dates, because getGreeting reads the local hour.
  it.each([
    [new Date(2026, 9, 23, 0, 0), 'Good morning'],
    [new Date(2026, 9, 23, 11, 59), 'Good morning'],
    [new Date(2026, 9, 23, 12, 0), 'Good afternoon'],
    [new Date(2026, 9, 23, 17, 59), 'Good afternoon'],
    [new Date(2026, 9, 23, 18, 0), 'Good evening'],
  ])('greets at %s with %s', (date, expected) => {
    expect(getGreeting(date)).toBe(expected);
  });
});

describe('cancelReasonLabel', () => {
  it.each([
    ['OUT_OF_STOCK', 'Out of stock'],
    ['PAYMENT_DECLINED', 'Payment declined'],
    ['SOMETHING_NEW', 'Cancelled'], // a reason the storefront does not know yet
    [null, 'Cancelled'],
    [undefined, 'Cancelled'],
  ])('labels %s as %s', (reason, label) => {
    expect(cancelReasonLabel(reason)).toBe(label);
  });
});
