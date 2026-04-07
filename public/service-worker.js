// ServiceWorker that creates MessageChannels and distributes ports to tabs
// No in-memory state - uses clients.matchAll() as source of truth since
// the SW can be terminated and restarted at any time.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("message", async (e) => {
  const { type } = e.data;
  const senderId = e.source?.id;
  if (!senderId) return;

  if (type === "hello") {
    const allClients = await self.clients.matchAll({ type: "window" });

    // Broadcast accurate tab count to everyone
    for (const c of allClients) {
      c.postMessage({ type: "tab-count", count: allClients.length });
    }

    // Create a direct channel between the new tab and every other tab
    for (const c of allClients) {
      if (c.id === senderId) continue;
      const channel = new MessageChannel();
      c.postMessage({ type: "direct-port", peerId: senderId }, [channel.port1]);
      const sender = allClients.find((x) => x.id === senderId);
      if (sender) {
        sender.postMessage({ type: "direct-port", peerId: c.id }, [channel.port2]);
      }
    }
  } else if (type === "goodbye") {
    // Tab is closing - notify remaining tabs
    const allClients = await self.clients.matchAll({ type: "window" });
    const remaining = allClients.filter((c) => c.id !== senderId);
    for (const c of remaining) {
      c.postMessage({ type: "peer-gone", peerId: senderId });
      c.postMessage({ type: "tab-count", count: remaining.length });
    }
  }
});
