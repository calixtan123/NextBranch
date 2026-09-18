/** Real-browser checks for the phone-sized Northern Direct experience. */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test, JOURNEY_URL, STATION_URL } from "./fixtures";
import { getLocalResource } from "./local-resource";

/** Selects a station through the same list a touch user sees. */
async function chooseStation(page: Page, label: string, name: string) {
  await page.getByRole("combobox", { name: label, exact: true }).fill(name);
  await page.getByRole("option", { name, exact: true }).click();
}

/** Checks rendered WCAG A/AA rules; this complements manual screen-reader checks. */
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
}

/** Checks the document and visible content, including absolutely positioned lists. */
async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return {
      document: document.documentElement.scrollWidth > width,
      elements: [...document.querySelectorAll("main *")].filter((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return box.width > 1 && box.height > 1 && style.visibility !== "hidden" && style.display !== "none" && (box.right > width + 1 || box.left < -1);
      }).map((element) => `${element.tagName}.${element.className}`),
    };
  });
  expect(overflow).toEqual({ document: false, elements: [] });
}

// Regression: a broken production entry point prevents choosing a station.
test("opens the departure station picker", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Northern Direct" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Station" })).toBeVisible();
});

// Regression: selecting a station loses the URL, platform groups, or arrival times.
test("selects a station and renders grouped live departures", async ({ page }) => {
  await page.goto("/");
  await chooseStation(page, "Station", "Camden Town");
  await expect(page).toHaveURL(STATION_URL);
  const northbound = page.getByRole("list", { name: "Platform 1 · Northbound departures" });
  await expect(northbound).toContainText("Edgware");
  await expect(northbound).toContainText("2 min");
  await expect(northbound).toContainText("13:02");
  await expect(page.getByRole("heading", { name: "Platform unavailable · Southbound" })).toBeVisible();
  await expect(page.getByText("Battersea Power Station", { exact: true })).toBeVisible();
});

// Regression: stored rows trigger a background board request, lack keyboard access, or disappear before a remount.
test("keeps saved and recent stations inactive until a keyboard choice opens one board", async ({ page }) => {
  const departureRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/departures") departureRequests.push(request.url());
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("northern-direct:stations:v1", JSON.stringify({
      saved: [{ id: "940GZZLUCTN", name: "Wrong saved name", lastUsedAt: 20 }],
      recent: [{ id: "940GZZLUAGL", name: "Wrong recent name", lastUsedAt: 10 }],
    }));
  });
  departureRequests.length = 0;
  await page.reload();

  await expect(page.getByRole("list", { name: "Saved and recent stations" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Camden Town", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Angel", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Station", exact: true })).toHaveValue("");
  await expectNoOverflow(page);
  await expectAccessible(page);
  expect(departureRequests).toEqual([]);

  await page.getByRole("button", { name: "Camden Town", exact: true }).press("Enter");
  await expect(page).toHaveURL(STATION_URL);
  await expect(page.getByRole("list", { name: "Platform 1 · Northbound departures" })).toBeVisible();
  expect(departureRequests).toHaveLength(1);
});

// Regression: form submission, persistent saving, or reopening a saved pair stops fetching results.
test("plans a direct journey and reopens it after a new page load", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Journeys", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "To", exact: true })).toBeDisabled();
  await chooseStation(page, "From", "Camden Town");
  await chooseStation(page, "To", "Edgware");
  await page.getByRole("button", { name: "Check trains" }).click();
  await expect(page).toHaveURL(JOURNEY_URL);
  await expect(page.getByRole("heading", { name: "Next trains" })).toBeVisible();
  await expect(page.getByRole("article")).toContainText("NEXT & BEST ARRIVAL");
  await expect(page.getByRole("article")).toContainText("13:22 · Live");
  await page.getByRole("button", { name: "Save journey", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: "Camden Town → Edgware", exact: true }).click();
  await expect(page).toHaveURL(JOURNEY_URL);
  await expect(page.getByRole("article")).toContainText("Edgware");
});

// Regression: client state ignores popstate and shows the previous URL's live view.
test("back and forward restore station and journey deep links", async ({ page }) => {
  await page.goto(STATION_URL);
  await expect(page.getByRole("list", { name: "Platform 1 · Northbound departures" })).toBeVisible();
  await page.getByRole("button", { name: "Journeys", exact: true }).click();
  await chooseStation(page, "From", "Camden Town");
  await chooseStation(page, "To", "Edgware");
  await page.getByRole("button", { name: "Check trains" }).click();
  await expect(page.getByRole("heading", { name: "Next trains" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(STATION_URL);
  await expect(page.getByRole("combobox", { name: "Station" })).toHaveValue("Camden Town");
  await expect(page.getByRole("list", { name: "Platform 1 · Northbound departures" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next trains" })).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(JOURNEY_URL);
  await expect(page.getByRole("heading", { name: "Next trains" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Selected journey" })).toContainText("Camden Town → Edgware");
});

for (const view of ["departures", "journey"] as const) {
  const url = view === "departures" ? STATION_URL : JOURNEY_URL;
  // Regression: failed first loads hide the retry action or cannot recover.
  test(`${view}: first-load failure recovers through Retry`, async ({ page, api }) => {
    api.mode = "unavailable";
    await page.goto(url);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable");
    api.mode = "live";
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByText("Edgware", { exact: true })).toBeVisible();
  });

  // Regression: a failed refresh discards useful previous predictions or presents them as fresh.
  test(`${view}: failed refresh retains predictions with a stale warning`, async ({ page, api }) => {
    await page.goto(url);
    await expect(page.getByText("Edgware", { exact: true })).toBeVisible();
    api.mode = "unavailable";
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("information may be stale");
    await expect(page.getByText("Edgware", { exact: true })).toBeVisible();
    await expect(page.getByText("NEXT & BEST ARRIVAL", { exact: true })).toHaveCount(0);
  });

  // Regression: losing network access leaves live claims visible and reconnect never recovers.
  test(`${view}: offline warning retains predictions and reconnect recovers`, async ({ page, context }) => {
    await page.goto(url);
    await expect(page.getByText("Edgware", { exact: true })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("requires an internet connection");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("information may be stale");
    await expect(page.getByText("Edgware", { exact: true })).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });

  // Regression: valid empty responses show an error or leave a misleading previous train visible.
  test(`${view}: empty predictions explain the absence of trains`, async ({ page, api }) => {
    api.mode = "empty";
    await page.goto(url);
    await expect(page.getByText(view === "departures" ? "No current Northern line departures are predicted." : "No suitable trains are currently predicted.")).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });
}

// Regression: combobox keyboard selection loses input focus or Tab traps the user in suggestions.
test("keyboard selection keeps focus, moves between inputs, and submits with Enter", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Journeys", exact: true }).click();
  const from = page.getByRole("combobox", { name: "From", exact: true });
  const to = page.getByRole("combobox", { name: "To", exact: true });
  await from.fill("Camden");
  await from.press("ArrowDown");
  await from.press("Enter");
  await expect(from).toHaveValue("Camden Town");
  await expect(from).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(to).toBeFocused();
  await to.fill("Edgware");
  await to.press("ArrowDown");
  await to.press("Enter");
  await expect(to).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(from).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(to).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Next trains" })).toBeVisible();
});

for (const width of [320, 390]) {
  // Regression: long destinations, open suggestions, cards, or saved rows overflow a phone screen;
  // missing labels/landmarks or unreadable contrast make any primary view inaccessible.
  test(`${width}px: primary views have no overflow or automated accessibility violations`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(STATION_URL);
    await expect(page.getByText("Battersea Power Station", { exact: true })).toBeVisible();
    await expectNoOverflow(page);
    await expectAccessible(page);
    await page.getByRole("button", { name: "Journeys", exact: true }).click();
    await page.getByRole("combobox", { name: "From", exact: true }).fill("Camden");
    await expect(page.getByRole("option", { name: "Camden Town" })).toBeVisible();
    await expectNoOverflow(page);
    await expectAccessible(page);
    await page.getByRole("option", { name: "Camden Town" }).click();
    await chooseStation(page, "To", "Edgware");
    await page.getByRole("button", { name: "Check trains" }).click();
    await expect(page.getByRole("article")).toBeVisible();
    await expectNoOverflow(page);
    await expectAccessible(page);
    await page.getByRole("button", { name: "Save journey", exact: true }).click();
    await page.getByRole("button", { name: "Journeys", exact: true }).click();
    await expect(page.getByRole("button", { name: "Camden Town → Edgware" })).toBeVisible();
    await expectNoOverflow(page);
    await expectAccessible(page);
  });
}

// Regression: broken manifest metadata or missing icons prevent browser installation discovery.
test("serves a discoverable standalone manifest and usable app icons", async ({ page, request, baseURL }) => {
  if (!baseURL) throw new Error("Manifest checks require the configured local origin");
  await page.goto("/");
  const manifestPath = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestPath).toBe("/manifest.webmanifest");
  const response = await getLocalResource(request, manifestPath!, baseURL);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: "Northern Direct", start_url: "/", display: "standalone" });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: "192x192", type: "image/png" }),
    expect.objectContaining({ sizes: "512x512", type: "image/png" }),
    expect.objectContaining({ purpose: "maskable", sizes: "512x512" }),
  ]));
  for (const icon of manifest.icons) {
    const image = await getLocalResource(request, icon.src, baseURL);
    expect(image.ok()).toBe(true);
    expect(image.headers()["content-type"]).toContain("image/png");
    const bytes = await image.body();
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
  }
});
