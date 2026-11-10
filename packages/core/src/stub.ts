/**
 * Marker for contract stubs: a function whose signature is frozen and whose implementation a later work
 * package owes. docs/CONTRACTS.md lists every stub and its owner; grep for `notImplemented(` to find them.
 */
export function notImplemented(name: string, owner: string): never {
  throw new Error(`not implemented: ${name} (owed by ${owner}, see docs/CONTRACTS.md)`);
}
