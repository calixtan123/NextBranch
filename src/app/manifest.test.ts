import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("PWA metadata", () => {
  it("declares standalone metadata and three real owned PNG icons", () => {
    expect(manifest().display).toBe("standalone");
    const icons: ReadonlyArray<readonly [string, number]> = [["icon-192.png", 192], ["icon-512.png", 512], ["maskable-512.png", 512]];
    for (const [name, size] of icons) {
      const bytes = readFileSync(resolve(process.cwd(), "public/icons", name));
      expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(bytes.readUInt32BE(16)).toBe(size); expect(bytes.readUInt32BE(20)).toBe(size);
    }
  });
});
