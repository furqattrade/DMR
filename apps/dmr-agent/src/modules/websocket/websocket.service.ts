import { JwtPayload, SocketClient } from '@dmr/shared';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { io } from 'socket.io-client';

@Injectable()
export class WebsocketService implements OnModuleInit {
  private readonly logger = new Logger(WebsocketService.name);
  private socket: SocketClient | null = null;
  private reconnectionAttempts = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connectToServer();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async connectToServer(): Promise<void> {
    const serverUrl = this.configService.get<string>('DMR_SERVER_WEBSOCKET_URL');
    if (!serverUrl) {
      this.logger.error('DMR_SERVER_WEBSOCKET_URL is not configured');
      return;
    }

    const agentId = this.configService.get<string>('AGENT_ID');
    if (!agentId) {
      this.logger.error('AGENT_ID is not configured');
      return;
    }

    const privateKey = this.configService.get<string>('AGENT_PRIVATE_KEY');
    if (!privateKey) {
      this.logger.error('AGENT_PRIVATE_KEY is not configured');
      return;
    }

    try {
      this.socket = io(serverUrl, {
        reconnectionDelay: this.configService.get<number>('WEBSOCKET_RECONNECTION_DELAY', 1000),
        reconnectionDelayMax: this.configService.get<number>('WEBSOCKET_DELAY_MAX', 5000),
        auth: (callback: (data: { token: string }) => void): void => {
          callback({ token: this.generateJwtToken(agentId, privateKey) });
        },
        // @ts-expect-error - Socket.io types don't include connectionStateRecovery yet
        connectionStateRecovery: {
          maxDisconnectionDuration: 2 * 60 * 1000,
        },
      }) as unknown as SocketClient;

      this.setupSocketEventListeners();
    } catch (error_) {
      const errorMessage = error_ instanceof Error ? error_.message : String(error_);
      this.logger.error(`Failed to connect to DMR server: ${errorMessage}`);
    }
  }

  private setupSocketEventListeners(): void {
    if (!this.socket) {
      this.logger.error('Cannot setup event listeners: Socket is not initialized');
      return;
    }

    this.socket.on('connect', () => {
      this.reconnectionAttempts = 0;
      if (this.socket) {
        this.logger.log(`Connected to DMR server with ID: ${this.socket.id}`);
        this.logger.log(
          `Recovery state: ${this.socket.recovered ? 'recovered' : 'new connection'}`,
        );
      }
    });

    this.socket.on('disconnect', (reason: string) => {
      this.logger.warn(`Disconnected from DMR server. Reason: ${reason}`);
    });

    this.socket.on('connect_error', (error: unknown) => {
      this.reconnectionAttempts++;
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error';
      this.logger.error(`Connection error (attempt ${this.reconnectionAttempts}): ${errorMessage}`);
    });

    this.socket.on('reconnect', (attempt: number) => {
      this.logger.log(`Reconnected to DMR server after ${attempt} attempts`);
    });

    this.socket.on('reconnect_attempt', () => {
      this.logger.log('Attempting to reconnect to DMR server...');
      // Refresh the JWT token on reconnection attempts
      const agentId = this.configService.get<string>('AGENT_ID');
      const privateKey = this.configService.get<string>('AGENT_PRIVATE_KEY');
      if (agentId && privateKey && this.socket) {
        this.socket.auth = { token: this.generateJwtToken(agentId, privateKey) };
      }
    });

    this.socket.on('reconnect_error', (error: unknown) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error';
      this.logger.error(`Reconnection error: ${errorMessage}`);
    });

    this.socket.on('reconnect_failed', () => {
      this.logger.error('Failed to reconnect to DMR server');
    });
  }

  private generateJwtToken(agentId: string, privateKey: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
      sub: agentId,
      iat: now,
      exp: now + 60,
    };

    return this.jwtService.sign(payload, {
      algorithm: 'RS256',
      privateKey,
      keyid: agentId,
    });
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.logger.log('Manually disconnected from DMR server');
    }
  }
}
