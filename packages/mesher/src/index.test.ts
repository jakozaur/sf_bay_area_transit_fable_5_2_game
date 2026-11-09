import { expect, test } from 'vitest';
import { PACKAGE_NAME } from './index.ts';

test('mesher placeholder exports its package name', () => {
  expect(PACKAGE_NAME).toBe('@bayvox/mesher');
});
