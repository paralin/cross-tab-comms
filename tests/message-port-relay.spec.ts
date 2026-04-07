import { test, expect } from "@playwright/test";

// Helper: wait for a log entry matching a pattern
function waitForLog(page: import("@playwright/test").Page, pattern: RegExp) {
  return page.locator("#log .log-entry").filter({ hasText: pattern }).first().waitFor({ timeout: 10_000 });
}

// Helper: open two tabs and wait for auto-channel establishment
async function openPair(context: import("@playwright/test").BrowserContext) {
  const tabA = await context.newPage();
  await tabA.goto("/");
  await waitForLog(tabA, /ServiceWorker registered/);
  await waitForLog(tabA, /1 tab\(s\) connected/);

  const tabB = await context.newPage();
  await tabB.goto("/");
  await waitForLog(tabB, /ServiceWorker registered/);
  await waitForLog(tabB, /2 tab\(s\) connected/);

  // Both tabs should get direct ports
  await waitForLog(tabA, /Direct channel to peer .+ established/);
  await waitForLog(tabB, /Direct channel to peer .+ established/);

  return { tabA, tabB };
}

test.describe("MessagePort relay via ServiceWorker", () => {
  test("two tabs connect and ServiceWorker auto-creates direct channel", async ({ context }) => {
    const tabA = await context.newPage();
    await tabA.goto("/");
    await waitForLog(tabA, /ServiceWorker registered/);
    await waitForLog(tabA, /1 tab\(s\) connected/);

    const tabB = await context.newPage();
    await tabB.goto("/");
    await waitForLog(tabB, /2 tab\(s\) connected/);
    await waitForLog(tabA, /2 tab\(s\) connected/);

    // Both tabs receive a direct port from the ServiceWorker
    await waitForLog(tabA, /Received direct port from ServiceWorker/);
    await waitForLog(tabB, /Received direct port from ServiceWorker/);
    await waitForLog(tabA, /Direct channel to peer .+ established/);
    await waitForLog(tabB, /Direct channel to peer .+ established/);
  });

  test("tabs exchange pings through direct MessagePort", async ({ context }) => {
    const { tabA, tabB } = await openPair(context);

    await tabA.click("#btn-ping");
    await waitForLog(tabA, /SEND.*"type":"ping"/);
    await waitForLog(tabB, /RECV:.*"type":"ping"/);

    await tabB.click("#btn-ping");
    await waitForLog(tabB, /SEND.*"type":"ping"/);
    await waitForLog(tabA, /RECV:.*"type":"ping"/);
  });

  test("tabs exchange text messages in both directions", async ({ context }) => {
    const { tabA, tabB } = await openPair(context);

    await tabA.fill("#msg-input", "hello from A");
    await tabA.click("#btn-send");
    await waitForLog(tabA, /SEND.*"text":"hello from A"/);
    await waitForLog(tabB, /RECV:.*"text":"hello from A"/);

    await tabB.fill("#msg-input", "hello from B");
    await tabB.click("#btn-send");
    await waitForLog(tabB, /SEND.*"text":"hello from B"/);
    await waitForLog(tabA, /RECV:.*"text":"hello from B"/);
  });

  test("single tab has buttons disabled (no channel yet)", async ({ context }) => {
    const tab = await context.newPage();
    await tab.goto("/");
    await waitForLog(tab, /1 tab\(s\) connected/);

    await expect(tab.locator("#btn-ping")).toBeDisabled();
    await expect(tab.locator("#btn-send")).toBeDisabled();
    await expect(tab.locator("#msg-input")).toBeDisabled();
  });

  test("multiple messages flow reliably", async ({ context }) => {
    const { tabA, tabB } = await openPair(context);

    for (let i = 0; i < 10; i++) {
      await tabA.fill("#msg-input", `msg-${i}`);
      await tabA.click("#btn-send");
    }

    for (let i = 0; i < 10; i++) {
      await waitForLog(tabB, new RegExp(`"text":"msg-${i}"`));
    }
  });

  test("closing a tab notifies remaining tabs", async ({ context }) => {
    const { tabA, tabB } = await openPair(context);

    // Playwright's page.close() doesn't fire beforeunload by default,
    // so trigger goodbye manually before closing.
    await tabB.evaluate(() => {
      navigator.serviceWorker.controller?.postMessage({ type: "goodbye" });
    });
    await tabB.close();
    await waitForLog(tabA, /disconnected/);
    await waitForLog(tabA, /1 tab\(s\) connected/);

    await expect(tabA.locator("#btn-ping")).toBeDisabled();
    await expect(tabA.locator("#btn-send")).toBeDisabled();
  });

  test("third tab gets channels to both existing tabs", async ({ context }) => {
    const { tabA, tabB } = await openPair(context);

    const tabC = await context.newPage();
    await tabC.goto("/");
    await waitForLog(tabC, /ServiceWorker registered/);
    await waitForLog(tabC, /3 tab\(s\) connected/);

    // Tab C should get 2 peer channels
    await waitForLog(tabC, /2 peer\(s\)/);

    // Send from C, both A and B should receive
    await tabC.fill("#msg-input", "hello from C");
    await tabC.click("#btn-send");
    await waitForLog(tabA, /RECV:.*"text":"hello from C"/);
    await waitForLog(tabB, /RECV:.*"text":"hello from C"/);
  });
});
