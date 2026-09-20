/** Fetches manifest and icon resources used by browser contract checks. */
import type { APIRequestContext, APIResponse } from "@playwright/test";

/**
 * Fetches one browser resource without allowing the check to leave the local origin.
 *
 * Parameters
 * ----------
 * request : APIRequestContext
 *     Playwright HTTP client used for the resource request.
 * resource : string
 *     Relative or absolute URL of the manifest or icon to fetch.
 * baseURL : string
 *     Configured local application origin against which the resource is resolved.
 *
 * Returns
 * -------
 * Promise<APIResponse>
 *     The non-redirecting response from the configured local origin.
 *
 * Raises
 * ------
 * Error
 *     If the resolved resource uses another origin or responds with a redirect.
 */
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
