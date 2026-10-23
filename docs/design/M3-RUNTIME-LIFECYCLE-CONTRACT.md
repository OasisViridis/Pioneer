# M3 Runtime Lifecycle Contract · Session INITIALIZED → Start Requested

> Status: approved engineering boundary for the third M3 vertical slice  
> Precondition: `READY → Runtime Session bootstrap` is on `main`  
> This contract defines a local lifecycle and append-only event skeleton only.

## 1. Purpose

The third M3 slice establishes the shape that a future runtime adapter will consume without pretending that an Agent process already exists.

```text
RuntimeSession.status = initialized
  → create local RuntimeLifecycle
  → event #1: session.initialized
  → user requests runtime start
  → RuntimeLifecycle.status = start_requested
  → event #2: runtime.start_requested
```

`start_requested` is a request boundary. It is **not** `running`.

## 2. Event-stream invariants

The local event stream is serializable and append-only for this slice. Lifecycles are only changed through the public transition functions; the returned object graph is frozen so recorded events cannot be edited or dropped in place.

- sequence numbers start at 1 and are contiguous;
- event ids are deterministic from `sessionId + sequence`;
- every event belongs to exactly one Runtime Session;
- the first event is always `session.initialized`;
- its approved intent revision must match the locked Runtime Session snapshot;
- a `start_requested` lifecycle has exactly one subsequent `runtime.start_requested` event;
- duplicate start requests are rejected rather than silently adding more events;
- a workspace that already holds a lifecycle rejects a second bootstrap instead of rebuilding and discarding recorded events.

No timestamps are fabricated in this slice. A future real runtime transport may add clocked transport envelopes at a separate boundary.

## 3. Capability boundary

The Runtime Session remains unchanged:

- model access: off;
- tool execution: off;
- file mutation: off.

Recording `runtime.start_requested` must not enable any capability and must not create a model, shell, tool, file, process, WebSocket, SSE connection, or Pi-Agent instance.

## 4. UI contract

The top-level scene remains `输入`.

After session initialization, the UI exposes one explicit action:

`请求启动 Runtime`

The UI then displays:

- lifecycle status `START REQUESTED`;
- the local event stream in sequence order;
- a clear statement that execution has not started;
- the three runtime capabilities still disabled.

The request action becomes unavailable after the transition.

## 5. Verification

The slice is valid only when:

- invalid sessions cannot create a lifecycle;
- initialization creates exactly one valid event;
- a start request appends exactly one second event;
- duplicate start requests are rejected;
- malformed event order, identity, or session ownership fails schema validation;
- Real Electron E2E reaches `START REQUESTED`;
- fixture workspaces remain byte-for-byte unchanged;
- no main/preload/IPC capability is added;
- `pnpm check` passes.
