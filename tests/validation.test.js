const test = require('node:test');
const assert = require('node:assert/strict');
const { positiveInteger, email, text } = require('../src/utils/validation');

test('positiveInteger accepts valid passenger counts', () => assert.equal(positiveInteger('3', 'Passenger count', 20), 3));
test('positiveInteger rejects zero', () => assert.throws(() => positiveInteger('0', 'Passenger count', 20), /whole number/));
test('email normalizes case and whitespace', () => assert.equal(email('  USER@Example.com '), 'user@example.com'));
test('email rejects malformed addresses', () => assert.throws(() => email('not-an-email'), /valid contact email/));
test('text trims values', () => assert.equal(text('  Lagos  ', 'Destination'), 'Lagos'));
