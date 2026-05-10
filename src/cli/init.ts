import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defaultConfig } from "../config/config.ts";
import { InferenceError, inferSchema } from "../config/inference.ts";

export async function runInit(args: { input: string }): Promise<void> {
  const inputPath = resolve(args.input);
  if (!existsSync(inputPath)) {
    console.error(`labellens init: file not found: ${inputPath}`);
    process.exit(2);
  }

  const configPath = resolve("./labellens.config.json");
  if (existsSync(configPath)) {
    console.error(
      `labellens init: ${configPath} already exists. Refusing to overwrite. Delete it first if you want to re-init.`,
    );
    process.exit(2);
  }

  console.log(`Inferring schema from ${inputPath}...`);
  const inference = await inferSchema(inputPath).catch((err: unknown) => {
    if (err instanceof InferenceError) {
      console.error(err.message);
      process.exit(2);
    }
    throw err;
  });

  console.log(
    `  sampled ${inference.sampleSize} records; top-level fields: ${inference.topLevelFields.join(", ")}`,
  );
  console.log(`  inferred fields: ${JSON.stringify(inference.fields)}`);
  if (inference.labels.length > 0) {
    console.log(`  inferred labels: ${inference.labels.join(", ")}`);
  } else {
    console.log("  inferred labels: (none — falling back to 'other')");
  }
  console.log(`  recommended task: ${inference.recommendedTask}`);

  const config = defaultConfig({
    inputPath,
    fields: inference.fields,
    labels: inference.labels,
    task: inference.recommendedTask,
  });

  await Bun.write(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`\nWrote ${configPath}`);
  console.log(
    `\nReview the config (especially 'labels'), then run 'labellens' to start reviewing.`,
  );
}
