/** Build-time data pipeline. Never imported by the app. */
export const PACKAGE_NAME = '@bayvox/pipeline';

/**
 * Stage names accepted by `node src/cli.ts <stage>`, in build order. Each is a directory with a cli.ts.
 * `terrain` and `vectors` write their own fragment; `manifest` merges the two into data/manifest.json.
 */
export const STAGES: readonly string[] = ['terrain', 'vectors', 'manifest'];
