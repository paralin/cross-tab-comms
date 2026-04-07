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
  <div id="status" class="status">Connecting to SharedWorker...</div>
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

// --- SharedWorker ---

let directPort: MessagePort | null = null;

function enableDirectChannel(port: MessagePort) {
  directPort = port;
  port.onmessage = (e: MessageEvent) => {
    log(`RECV: ${JSON.stringify(e.data)}`, "msg-in");
  };
  port.start();
  btnPing.disabled = false;
  btnSend.disabled = false;
  msgInput.disabled = false;
  log("Direct MessagePort channel established!", "success");
}

let worker: SharedWorker;
try {
  worker = new SharedWorker(new URL("./shared-worker.ts", import.meta.url), {
    type: "module",
    name: "cross-tab-relay",
  });

  worker.port.onmessage = (e: MessageEvent) => {
    const { type } = e.data;

    if (type === "tab-count") {
      statusEl.textContent = `Connected to SharedWorker. Tabs connected: ${e.data.count}`;
      statusEl.classList.add("connected");
      log(`SharedWorker reports ${e.data.count} tab(s) connected`, "info");
    } else if (type === "direct-port") {
      const port = e.ports[0];
      if (port) {
        log(`Received direct port from SharedWorker (peer: tab ${e.data.peerId})`, "success");
        enableDirectChannel(port);
      } else {
        log("direct-port event but no port attached", "error");
      }
    } else if (type === "error") {
      log(`SharedWorker error: ${e.data.message}`, "error");
    }
  };

  worker.port.start();
  log(`Tab ${tabId} started, connecting to SharedWorker...`, "info");
} catch (err) {
  log(`Failed to create SharedWorker: ${err}`, "error");
  statusEl.textContent = "SharedWorker not supported or failed";
}

// --- Actions ---

btnPing.addEventListener("click", () => {
  if (!directPort) return;
  const msg = { type: "ping", from: tabId, time: performance.now() };
  directPort.postMessage(msg);
  log(`SEND: ${JSON.stringify(msg)}`, "msg-out");
});

btnSend.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  if (!directPort || !msgInput.value.trim()) return;
  const msg = { type: "message", from: tabId, text: msgInput.value.trim() };
  directPort.postMessage(msg);
  log(`SEND: ${JSON.stringify(msg)}`, "msg-out");
  msgInput.value = "";
}
