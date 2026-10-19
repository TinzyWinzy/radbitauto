import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTIFICATION_PREFS,
  channelEnabled,
  effectiveChannels,
  resolveNotificationPrefs,
} from '../src/notificationPolicy.ts';

test('defaults enable transactional channels and keep marketing opt-in', () => {
  assert.deepEqual(DEFAULT_NOTIFICATION_PREFS, { email: true, whatsapp: true, sms: true, marketing: false });
  assert.deepEqual(resolveNotificationPrefs(undefined), DEFAULT_NOTIFICATION_PREFS);
  assert.equal(channelEnabled(DEFAULT_NOTIFICATION_PREFS, 'email'), true);
  assert.equal(channelEnabled(DEFAULT_NOTIFICATION_PREFS, 'sms'), true);
});

test('explicit opt-outs disable only the chosen channels', () => {
  const prefs = resolveNotificationPrefs({ email: false, sms: false, marketing: true });
  assert.deepEqual(prefs, { email: false, whatsapp: true, sms: false, marketing: true });
  assert.equal(channelEnabled(prefs, 'email'), false);
  assert.equal(channelEnabled(prefs, 'whatsapp'), true);
  assert.equal(channelEnabled(prefs, 'in_app'), true);
  assert.equal(channelEnabled(prefs, 'log'), true);
});

test('marketing events are dropped unless marketing is opted in', () => {
  const off = resolveNotificationPrefs({});
  assert.deepEqual(effectiveChannels('marketing_alert', ['in_app', 'email'], off), []);
  assert.deepEqual(effectiveChannels('status_update', ['in_app', 'email'], off), ['in_app', 'email']);
  const on = resolveNotificationPrefs({ marketing: true });
  assert.deepEqual(effectiveChannels('marketing_alert', ['in_app', 'email'], on), ['in_app', 'email']);
});

test('disabled channels are removed from an outbox row', () => {
  const prefs = resolveNotificationPrefs({ email: false });
  assert.deepEqual(effectiveChannels('status_update', ['in_app', 'log', 'email', 'sms'], prefs), ['in_app', 'log', 'sms']);
});
