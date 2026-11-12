export interface HistoryStack<T> {
  past: T[];
  future: T[];
  limit: number;
}

export function createHistory<T>(limit = 100): HistoryStack<T> {
  return { past: [], future: [], limit };
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function historyPush<T>(stack: HistoryStack<T>, before: T): void {
  stack.past.push(copy(before));
  if (stack.past.length > stack.limit) stack.past.shift();
  stack.future = [];
}

export function historyUndo<T>(stack: HistoryStack<T>, current: T): T | null {
  const prev = stack.past.pop();
  if (!prev) return null;
  stack.future.push(copy(current));
  return prev;
}

export function historyRedo<T>(stack: HistoryStack<T>, current: T): T | null {
  const next = stack.future.pop();
  if (!next) return null;
  stack.past.push(copy(current));
  return next;
}
