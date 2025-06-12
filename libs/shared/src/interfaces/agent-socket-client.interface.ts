export interface SocketClient {
  id: string;
  recovered: boolean;
  connected: boolean;
  auth: Record<string, unknown>;
  disconnect(): void;
  on(event: string, callback: (...arguments_: unknown[]) => void): void;
}
