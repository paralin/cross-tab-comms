import "./style.css";

const tabId = crypto.randomUUID().slice(0, 8);

// --- Logging ---

const logEl = document.createElement("div");
logEl.id = "log";

function log(msg: string, cls: string = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${cls}`;
  const ts = new Date().toISOString().slice(11, 23);
  entry.innerHTML = `<span class="ts">${ts}</span> ${msg}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

// --- UI ---

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <h1>Cross-Tab MessagePort Relay <small>tab:${tabId}</small></h1>
  <div id="status" class="status">Registering ServiceWorker...</div>
  <div class="controls">
    <button id="btn-ping" disabled>Send Ping</button>
  </div>
  <div class="send-row">
    <input id="msg-input" placeholder="Type a message..." disabled />
    <button id="btn-send" disabled>Send</button>
  </div>
`;
document.querySelector<HTMLDivElement>("#app")!.appendChild(logEl);

const statusEl = document.getElementById("status")!;
const btnPing = document.getElementById("btn-ping") as HTMLButtonElement;
const btnSend = document.getElementById("btn-send") as HTMLButtonElement;
const msgInput = document.getElementById("msg-input") as HTMLInputElement;

// --- ServiceWorker ---

const peers = new Map<string, MessagePort>();

function addPeer(peerId: string, port: MessagePort) {
  const existing = peers.get(peerId);
  if (existing) {
    existing.close();
  }
  peers.set(peerId, port);
  port.onmessage = (e: MessageEvent) => {
    log(`RECV: ${JSON.stringify(e.data)}`, "msg-in");
  };
  port.start();
  btnPing.disabled = false;
  btnSend.disabled = false;
  msgInput.disabled = false;
  log(`Direct channel to peer ${peerId} established (${peers.size} peer(s))`, "success");
}

function broadcastToPeers(msg: object) {
  for (const [, port] of peers) {
    port.postMessage(msg);
  }
}

navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
  const { type } = e.data;

  if (type === "tab-count") {
    statusEl.textContent = `Connected to ServiceWorker. Tabs connected: ${e.data.count}`;
    statusEl.classList.add("connected");
    log(`ServiceWorker reports ${e.data.count} tab(s) connected`, "info");
  } else if (type === "direct-port") {
    const port = e.ports[0];
    if (port) {
      log(`Received direct port from ServiceWorker (peer: ${e.data.peerId})`, "success");
      addPeer(e.data.peerId, port);
    } else {
      log("direct-port event but no port attached", "error");
    }
  } else if (type === "peer-gone") {
    const gone = e.data.peerId as string;
    const port = peers.get(gone);
    if (port) {
      port.close();
      peers.delete(gone);
      log(`Peer ${gone} disconnected (${peers.size} peer(s) remaining)`, "info");
      if (peers.size === 0) {
        btnPing.disabled = true;
        btnSend.disabled = true;
        msgInput.disabled = true;
      }
    }
  } else if (type === "error") {
    log(`ServiceWorker error: ${e.data.message}`, "error");
  }
});

async function registerSW() {
  try {
    const reg = await navigator.serviceWorker.register("/service-worker.js");
    log(`Tab ${tabId} started, ServiceWorker registered`, "info");

    // Wait for the SW to become active
    const sw = reg.active || reg.installing || reg.waiting;
    if (!sw) {
      log("No ServiceWorker instance found after registration", "error");
      return;
    }

    if (sw.state === "activated") {
      sw.postMessage({ type: "hello" });
    } else {
      sw.addEventListener("statechange", () => {
        if (sw.state === "activated") {
          sw.postMessage({ type: "hello" });
        }
      });
    }
  } catch (err) {
    log(`Failed to register ServiceWorker: ${err}`, "error");
    statusEl.textContent = "ServiceWorker registration failed";
  }
}

registerSW();

window.addEventListener("beforeunload", () => {
  navigator.serviceWorker.controller?.postMessage({ type: "goodbye" });
});

// --- Actions ---

btnPing.addEventListener("click", () => {
  if (peers.size === 0) return;
  const msg = { type: "ping", from: tabId, time: performance.now() };
  broadcastToPeers(msg);
  log(`SEND (${peers.size} peer(s)): ${JSON.stringify(msg)}`, "msg-out");
});

btnSend.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  if (peers.size === 0 || !msgInput.value.trim()) return;
  const msg = { type: "message", from: tabId, text: msgInput.value.trim() };
  broadcastToPeers(msg);
  log(`SEND (${peers.size} peer(s)): ${JSON.stringify(msg)}`, "msg-out");
  msgInput.value = "";
}
