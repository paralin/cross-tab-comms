import { test, expect } from "@playwright/test";

// Helper: wait for a log entry matching a pattern
function waitForLog(page: import("@playwright/test").Page, pattern: RegExp) {
  return page.locator("#log .log-entry").filter({ hasText: pattern }).first().waitFor({ timeout: 10_000 });
}

// Helper: open two tabs and wait for auto-channel establishment
async function openPair(context: import("@playwright/test").BrowserContext) {
  const tabA = await context.newPage();
  await tabA.goto("/");
  await waitForLog(tabA, /1 tab\(s\) connected/);

  const tabB = await context.newPage();
  await tabB.goto("/");
  await waitForLog(tabB, /2 tab\(s\) connected/);

  // SharedWorker auto-creates channel when 2nd tab connects
  await waitForLog(tabA, /Direct MessagePort channel established/);
  await waitForLog(tabB, /Direct MessagePort channel established/);

  return { tabA, tabB };
}

test.describe("MessagePort relay via SharedWorker", () => {
  test("two tabs connect and SharedWorker auto-creates direct channel", async ({ context }) => {
    const tabA = await context.newPage();
    await tabA.goto("/");
    await waitForLog(tabA, /1 tab\(s\) connected/);

    const tabB = await context.newPage();
    await tabB.goto("/");
    await waitForLog(tabB, /2 tab\(s\) connected/);
    await waitForLog(tabA, /2 tab\(s\) connected/);

    // Both tabs receive a direct port from the SharedWorker
    await waitForLog(tabA, /Received direct port from SharedWorker/);
    await waitForLog(tabB, /Received direct port from SharedWorker/);
    await waitForLog(tabA, /Direct MessagePort channel established/);
    await waitForLog(tabB, /Direct MessagePort channel established/);
  });

  test("tabs exchange pings through direct MessagePort", async ({ context }) => {
    const { tabA, tabB } = await openPair(context);

    await tabA.click("#btn-ping");
    await waitForLog(tabA, /SEND:.*"type":"ping"/);
    await waitForLog(tabB, /RECV:.*"type":"ping"/);

    await tabB.click("#btn-ping");
    await waitForLog(tabB, /SEND:.*"type":"ping"/);
    await waitForLog(tabA, /RECV:.*"type":"ping"/);
  });

  test("tabs exchange text messages in both directions", async ({ context }) => {
    const { tabA, tabB } = await openPair(context);

    await tabA.fill("#msg-input", "hello from A");
    await tabA.click("#btn-send");
    await waitForLog(tabA, /SEND:.*"text":"hello from A"/);
    await waitForLog(tabB, /RECV:.*"text":"hello from A"/);

    await tabB.fill("#msg-input", "hello from B");
    await tabB.click("#btn-send");
    await waitForLog(tabB, /SEND:.*"text":"hello from B"/);
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
});
