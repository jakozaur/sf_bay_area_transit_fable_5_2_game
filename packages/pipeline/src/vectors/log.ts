/** Plain timed progress lines on stdout. */
export function log(what: string, t0?: number): void {
  const took = t0 === undefined ? '' : ` in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
  console.log(`vectors: ${what}${took}`);
}
