function clone<T>(value: T): T {
  // Page history contains JSON layouts, including nested Vue reactive proxies.
  return JSON.parse(JSON.stringify(value));
}

export class LayoutHistory<T> {
  private entries: T[] = [];
  private position = -1;

  constructor(private readonly limit = 50) {}

  reset(value: T) {
    this.entries = [clone(value)];
    this.position = 0;
  }

  record(value: T) {
    const serialized = JSON.stringify(value);
    if (this.position >= 0 && JSON.stringify(this.entries[this.position]) === serialized) return;
    this.entries = this.entries.slice(0, this.position + 1);
    this.entries.push(clone(value));
    if (this.entries.length > this.limit) this.entries.shift();
    this.position = this.entries.length - 1;
  }

  undo() {
    if (!this.canUndo) return undefined;
    this.position -= 1;
    return clone(this.entries[this.position]);
  }

  redo() {
    if (!this.canRedo) return undefined;
    this.position += 1;
    return clone(this.entries[this.position]);
  }

  get canUndo() { return this.position > 0; }
  get canRedo() { return this.position >= 0 && this.position < this.entries.length - 1; }
}
