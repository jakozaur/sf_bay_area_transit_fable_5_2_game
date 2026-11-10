/** Preact UI (work package UI, docs/CONTRACTS.md). The contract is in ./contract.ts; fixtures and a fake BayServices are in ./testing. */
export const PACKAGE_NAME = '@bayvox/ui';

export * from './contract.ts';
export * as format from './format.ts';
export { type KeyInput, type KeyIntent, type KeyState, resolveKey } from './keys.ts';
