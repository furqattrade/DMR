process.env.DMR_SERVER_WEBSOCKET_URL = 'ws://localhost:3000';
process.env.WEBSOCKET_RECONNECTION_DELAY = '1000';
process.env.WEBSOCKET_RECONNECTION_DELAY_MAX = '5000';
process.env.WEBSOCKET_ACK_TIMEOUT = '10000';

import 'reflect-metadata';
import { afterAll, beforeAll, vi } from 'vitest';

beforeAll(() => {
  // Add any global setup here
});

afterAll(() => {
  // Add any global cleanup here
  vi.resetModules();
});
