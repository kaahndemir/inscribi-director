// In-memory stand-in for JsonStore.
export class MemoryStore {
  constructor(initial = {}) {
    this.data = structuredClone(initial);
  }
  read(name, fallback) {
    return name in this.data ? structuredClone(this.data[name]) : fallback;
  }
  write(name, value) {
    this.data[name] = structuredClone(value);
  }
}
