import { expect, test, type Page } from "@playwright/test";

const MOCK_URL = "/?src=mock&reticle=av&fleet=60";

async function openMap(page: Page, url = MOCK_URL) {
  // Keep the run hermetic: tiles come from Esri, fonts from Google.
  await page.route("**/services.arcgisonline.com/**", (r) => r.fulfill({ status: 204, body: "" }));
  await page.goto(url);
  await page.locator('[data-testid="map"][data-map-ready="true"]').waitFor({ timeout: 30_000 });
}

test("renders the fleet in mock mode", async ({ page }) => {
  await openMap(page);
  await expect(page.getByTestId("source-badge")).toHaveText("mockdata");
  await expect(page.locator("header")).toContainText(/\d+ enheter/);
  await expect(page.locator(".mk-host").first()).toBeAttached();
  await expect(page.getByRole("option", { name: /VKT-0917/ })).toBeVisible();
});

test("status filter narrows the list and toggles aria-pressed", async ({ page }) => {
  await openMap(page);
  const chip = page.getByRole("button", { name: /^varsel/ });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  const rows = page.getByRole("option");
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await expect(rows.nth(i)).toContainText("varsel");
  await expect(page.locator("aside")).toContainText(/\d+ av \d+ enheter/);
});

test("selecting a unit opens the detail panel and Escape closes it", async ({ page }) => {
  await openMap(page);
  await page.getByRole("option", { name: /VKT-2481/ }).click();
  const panel = page.getByTestId("detail-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("VKT-2481");
  await expect(panel).toContainText("Hendelseslogg");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("playback advances the timeline", async ({ page }) => {
  await openMap(page);
  const range = page.getByTestId("timeline-range");
  await expect(range).toHaveValue("100");
  await page.getByRole("button", { name: /Spill av/ }).click();
  await page.waitForTimeout(600);
  const v = Number(await range.inputValue());
  expect(v).toBeGreaterThan(0);
  expect(v).toBeLessThan(100);
  await expect(page.getByTestId("timeline")).toContainText(/−\d+ t/);
  await page.getByRole("button", { name: /Pause/ }).click();
  const paused = await range.inputValue();
  await page.waitForTimeout(200);
  expect(await range.inputValue()).toBe(paused);
});

test("tracking deep link selects the unit", async ({ page }) => {
  await openMap(page, "/spor/VKT-0917?src=mock&reticle=av");
  await expect(page.getByTestId("detail-panel")).toContainText("VKT-0917");
});

test("keyboard: arrows move through the list and Enter selects", async ({ page }) => {
  await openMap(page);
  await page.getByRole("option").first().focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("detail-panel")).toBeVisible();
});
