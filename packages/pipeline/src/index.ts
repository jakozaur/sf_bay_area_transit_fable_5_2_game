/** Build-time data pipeline. Stages are added by the pipeline work packages; never imported by the app. */
export const PACKAGE_NAME = '@bayvox/pipeline';

/** Stage names accepted by `node src/cli.ts <stage>`. Empty until the pipeline work packages land. */
export const STAGES: readonly string[] = [];
