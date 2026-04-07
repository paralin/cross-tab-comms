# cross-tab-comms

Exploring cross-tab communication in the browser: how fast can two tabs talk
to each other, and which mechanism works best?

## How it works

A `SharedWorker` acts as a matchmaker. Each tab connects to the worker on load.
When a second tab connects, the worker creates a `MessageChannel` inside itself
and transfers one port to each tab. After that handshake the two tabs hold
opposite ends of the same channel and communicate directly, with no worker in
the data path.

```
Tab A  <--port1--  SharedWorker  --port2-->  Tab B
                   (creates the
                    MessageChannel,
                    then steps aside)

Tab A  <========== direct channel ==========> Tab B
                   (worker is not
                    involved anymore)
```

The key insight: `MessagePort` is a transferable object. A worker can create
one and hand the ends to different tabs, establishing a zero-intermediary
link between them.

### Files

- `src/shared-worker.ts` - creates `MessageChannel`s and distributes ports
  to connected tabs. Auto-pairs when a second tab arrives.
- `src/main.ts` - tab UI. Connects to the SharedWorker, receives a port,
  and exposes ping/message controls once the direct channel is up.

## Running

```
bun install
bun run dev
```

Open two tabs to the same URL. They auto-connect and you can send pings or
text messages between them.

## Tests

```
bun run test
```

Playwright tests verify the full flow (connect, auto-channel, ping, messaging)
across Chromium, Firefox, and WebKit.

## Planned approaches to benchmark

- MessagePort via SharedWorker (current, working)
- BroadcastChannel
- localStorage events + OPFS for payload storage
- Service Worker relay
- Other mechanisms TBD
