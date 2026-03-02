export class ToolExecutionQueue {
  private readonly queues = new Map<string, { tail: Promise<unknown>; pending: number }>();

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const entry = this.queues.get(key) ?? { tail: Promise.resolve(), pending: 0 };
    this.queues.set(key, entry);
    entry.pending += 1;

    const task = entry.tail.then(operation, operation);
    entry.tail = task.catch(() => undefined);

    try {
      return await task;
    } finally {
      entry.pending -= 1;
      if (entry.pending === 0) {
        this.queues.delete(key);
      }
    }
  }

  getPendingKeyCount(): number {
    return this.queues.size;
  }
}
