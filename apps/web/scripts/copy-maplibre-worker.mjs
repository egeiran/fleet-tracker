// MapLibre GL 6 ships its web worker as a separate module that imports a shared chunk.
// Bundlers cannot resolve that pair reliably, so serve both files from /public and point
// `setWorkerUrl` at them (see hooks/useFleetMap.ts).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "maplibre");
mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker-dev.mjs", "maplibre-gl-shared-dev.mjs"]) {
  copyFileSync(join(dist, f), join(out, f));
}
console.log(`maplibre worker copied to ${out}`);
