import { expect, test } from 'vitest';
import { PACKAGE_NAME } from './index.ts';

test('input placeholder exports its package name', () => {
  expect(PACKAGE_NAME).toBe('@bayvox/input');
});
