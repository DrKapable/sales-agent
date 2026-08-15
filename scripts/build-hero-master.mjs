import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const chunksDir = join(process.cwd(), "assets", "hero-master");
const outputPath = join(process.cwd(), "public", "medminds-hero-mary-kaunda-hq.webp");
const expectedBytes = 90322;

const files = (await readdir(chunksDir))
  .filter((name) => /^part-\d+\.b64$/.test(name))
  .sort();

if (files.length !== 13) {
  throw new Error(`Expected 13 hero-master chunks, found ${files.length}.`);
}

const encoded = (
  await Promise.all(
    files.map(async (name) => (await readFile(join(chunksDir, name), "utf8")).trim())
  )
).join("");

const image = Buffer.from(encoded, "base64");

if (image.length !== expectedBytes) {
  throw new Error(`Hero master size mismatch: expected ${expectedBytes}, got ${image.length}.`);
}

if (
  image.subarray(0, 4).toString("ascii") !== "RIFF" ||
  image.subarray(8, 12).toString("ascii") !== "WEBP"
) {
  throw new Error("Hero master is not a valid WebP container.");
}

await writeFile(outputPath, image);
const info = await stat(outputPath);
console.log(`Generated ${outputPath} (${info.size} bytes) from ${files.length} verified chunks.`);
