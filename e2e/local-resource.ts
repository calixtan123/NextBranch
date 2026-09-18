/** Fetches manifest and icon resources used by browser contract checks. */
import type { APIRequestContext, APIResponse } from "@playwright/test";

/** Rejects other origins before requesting and rejects redirects without following them. */
export async function getLocalResource(request: APIRequestContext, resource: string, baseURL: string): Promise<APIResponse> {
  const url = new URL(resource, baseURL);
  if (url.origin !== new URL(baseURL).origin) {
    throw new Error("Resource must use the configured local origin");
  }
  const response = await request.get(url.href, { maxRedirects: 0 });
  if (response.status() >= 300 && response.status() < 400) {
    await response.dispose();
    throw new Error("Resource redirects are not allowed");
  }
  return response;
}
