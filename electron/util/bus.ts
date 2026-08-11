import { EventEmitter } from 'node:events';

const bus = new EventEmitter();

export function on(event: string, listener: (...args: unknown[]) => void): () => void {
  bus.on(event, listener);
  return () => bus.off(event, listener);
}

export function emit(event: string, ...args: unknown[]): void {
  bus.emit(event, ...args);
}
