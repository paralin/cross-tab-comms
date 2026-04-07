/// <reference lib="webworker" />
// SharedWorker that creates MessageChannels and distributes ports to tabs

const _self = self as unknown as SharedWorkerGlobalScope;
const tabs: MessagePort[] = [];

function broadcastTabCount() {
  for (const p of tabs) {
    p.postMessage({ type: "tab-count", count: tabs.length });
  }
}

function createAndDistributeChannel(a: number, b: number) {
  const channel = new MessageChannel();
  tabs[a].postMessage({ type: "direct-port", peerId: b }, [channel.port1]);
  tabs[b].postMessage({ type: "direct-port", peerId: a }, [channel.port2]);
}

_self.onconnect = (e) => {
  const tabPort = e.ports[0];
  const tabIndex = tabs.length;
  tabs.push(tabPort);

  tabPort.onmessage = (msg: MessageEvent) => {
    const { type } = msg.data;

    if (type === "request-channel") {
      const targetIndex = msg.data.targetIndex as number;
      if (targetIndex < 0 || targetIndex >= tabs.length || targetIndex === tabIndex) {
        tabPort.postMessage({ type: "error", message: `Invalid target tab: ${targetIndex}` });
        return;
      }
      createAndDistributeChannel(tabIndex, targetIndex);
    }
  };

  tabPort.start();

  // If there are exactly 2 tabs, auto-create a channel between them
  if (tabs.length === 2) {
    createAndDistributeChannel(0, 1);
  }

  broadcastTabCount();
};
