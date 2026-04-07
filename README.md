# cross-tab-comms

Direct tab-to-tab communication via `MessagePort`, using a `ServiceWorker` as
the signaling layer. The ServiceWorker is only involved during setup and
teardown; once connected, tabs talk directly through `MessageChannel` ports
with no intermediary.

## How it works

```
 Tab A                ServiceWorker              Tab B
   |    register/hello     |                       |
   |---------------------->|                       |
   |                       |    register/hello     |
   |                       |<----------------------|
   |                       |                       |
   |        creates MessageChannel(port1, port2)   |
   |                       |                       |
   |  direct-port(port1)   |  direct-port(port2)   |
   |<----------------------|---------------------->|
   |                       |                       |
   |     (SW steps aside, may even terminate)      |
   |                       |                       |
   |<============ direct channel ================>|
   |         port1 <-----> port2                   |
```

1. Each tab registers the ServiceWorker and sends a `hello` message.
2. The SW calls `clients.matchAll()` to discover all open tabs (no in-memory
   state, so it survives termination and restart).
3. For each existing tab, the SW creates a `MessageChannel` and transfers one
   port to the new tab and the other to the existing tab.
4. Tabs store a `Map<peerId, MessagePort>` so every tab has a direct channel
   to every other tab. Messages broadcast to all peers.
5. On `beforeunload`, tabs send `goodbye` so the SW can notify remaining tabs
   via `peer-gone` and update the count.

### Why ServiceWorker over SharedWorker

We started with a SharedWorker but switched to ServiceWorker because:

- ServiceWorker has broader browser support (Safari added SharedWorker support
  only recently, and some environments still lack it).
- ServiceWorker survives tab closures and can be restarted by the browser,
  while SharedWorker dies when the last tab closes.
- `clients.matchAll()` gives the SW a stateless way to enumerate tabs,
  avoiding the in-memory state problem that SharedWorker has.
- The SW can be terminated at any time and resume correctly, since it derives
  all state from the current client list rather than maintaining it in memory.

The tradeoff is that ServiceWorker registration requires either HTTPS or
`localhost`.

### Key findings

- `MessagePort` is transferable through `client.postMessage()`, so a
  ServiceWorker can create a `MessageChannel` and hand each end to a
  different tab.
- Once transferred, the ports work directly between tabs. The SW is not in
  the data path and can even be terminated without breaking existing channels.
- Works in Chrome, Firefox, and Safari (WebKit).

## Files

- `public/service-worker.js` - stateless SW that pairs tabs with
  `MessageChannel`s using `clients.matchAll()` as the source of truth.
- `src/main.ts` - tab-side code. Registers SW, manages a peer map, handles
  connect/disconnect lifecycle.

## Running

```
bun install
bun run dev
```

Open two or more tabs to the same URL. They auto-connect and you can send
pings or text messages between them. Close a tab and the remaining tabs are
notified.

## Tests

```
bun run test
```

Playwright tests verify the flow across Chromium, Firefox, and WebKit.
