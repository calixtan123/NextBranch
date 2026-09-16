import { readFileSync, writeFileSync } from "node:fs";
const source = readFileSync("src/lib/northern/bundledTopology.ts", "utf8");
const routes = [...source.matchAll(/naptanIds:\s*\[([\s\S]*?)\]/g)].map((match) => [...match[1].matchAll(/"(940GZZ[A-Z0-9]+)"/g)].map((id) => id[1]));
const map = {};
for (const route of routes) route.forEach((from, index) => { map[from] ??= new Set(); route.slice(index + 1).forEach((to) => map[from].add(to)); });
const serialisable = Object.fromEntries(Object.entries(map).map(([from, destinations]) => [from, [...destinations].sort()]));
writeFileSync("src/lib/northern/direct-destination-map.ts", `/** Generated from the audited bundled route snapshot; do not place TfL topology in components. */\nexport const directDestinationIds: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(serialisable, null, 2)};\n`);
