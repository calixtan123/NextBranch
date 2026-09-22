/** Proves manifest checks cannot follow untrusted URLs beyond the local origin. */
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { expect, test } from "@playwright/test";
import { getLocalResource } from "./local-resource";

/** Starts an ephemeral loopback server and returns its distinct origin. */
async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a loopback TCP server");
  return `http://127.0.0.1:${address.port}`;
}

/** Releases the controlled server after the request checks, including failures. */
async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

// Regression: an absolute manifest/icon URL bypasses browser interception and contacts another origin.
test("manifest resource guard rejects external URLs before contacting their target", async ({ request }) => {
  let targetRequests = 0;
  const target = createServer((_request, response) => { targetRequests++; response.end("external"); });
  const targetOrigin = await listen(target);
  try {
    await expect(getLocalResource(request, `${targetOrigin}/icon.png`, "http://127.0.0.1:3100"))
      .rejects.toThrow("Resource must use the configured local origin");
    expect(targetRequests).toBe(0);
  } finally {
    await close(target);
  }
});

// Regression: an initially local resource redirects the separate HTTP client to an external origin.
test("manifest resource guard accepts local responses but rejects redirects before contacting their target", async ({ request }) => {
  let targetRequests = 0;
  const target = createServer((_request, response) => { targetRequests++; response.end("external"); });
  const targetOrigin = await listen(target);
  const source = createServer((incoming, response) => {
    if (incoming.url === "/redirect") {
      response.writeHead(302, { Location: `${targetOrigin}/icon.png` });
    }
    response.end("local");
  });
  try {
    const sourceOrigin = await listen(source);
    const response = await getLocalResource(request, "/icon.png", sourceOrigin);
    expect(response.status()).toBe(200);
    expect(await response.text()).toBe("local");
    await expect(getLocalResource(request, "/redirect", sourceOrigin))
      .rejects.toThrow("Resource redirects are not allowed");
    expect(targetRequests).toBe(0);
  } finally {
    await close(source);
    await close(target);
  }
});
