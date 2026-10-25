import type { Response } from 'express';

/** Live-Aktualisierung per Server-Sent Events: Änderungen erscheinen sofort bei allen Haushaltsmitgliedern. */
const subscribers = new Map<string, Set<Response>>();

export function subscribe(householdId: string, res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const set = subscribers.get(householdId) ?? new Set<Response>();
  set.add(res);
  subscribers.set(householdId, set);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  res.on('close', () => {
    clearInterval(ping);
    set.delete(res);
  });
}

export function publish(householdId: string, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subscribers.get(householdId) ?? []) res.write(payload);
}

export function publishAll(event: string, data: unknown) {
  for (const id of subscribers.keys()) publish(id, event, data);
}
