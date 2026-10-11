// Minimal synchronous event bus. State changes emit events; the UI
// (or any other consumer) subscribes and re-renders. Rules and state
// never talk to the UI directly — only through this bus.

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, fn) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const list = this.listeners.get(event);
    if (!list) {
      return;
    }
    this.listeners.set(event, list.filter((f) => f !== fn));
  }

  emit(event, payload) {
    const list = this.listeners.get(event);
    if (!list) {
      return;
    }
    for (const fn of [...list]) {
      fn(payload);
    }
  }
}
