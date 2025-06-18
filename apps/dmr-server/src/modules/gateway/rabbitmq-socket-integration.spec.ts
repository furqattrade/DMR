import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { AgentEncryptedMessageDto, AgentEventNames, MessageType } from '@dmr/shared';
import { AgentGateway } from './agent.gateway';
import { AuthService } from '../auth/auth.service';
import { RabbitMQService } from '../../libs/rabbitmq';
import { CentOpsService } from '../centops/centops.service';
import { JwtPayload } from '@dmr/shared';

// Extend Socket interface to include agent property
declare module 'socket.io' {
  interface Socket {
    agent: JwtPayload;
  }
}

describe('RabbitMQ to Socket.IO Integration', () => {
  let gateway: AgentGateway;
  let eventEmitter: EventEmitter2;
  let rabbitMQService: RabbitMQService;
  let serverMock: Server;
  let loggerSpy: ReturnType<typeof vi.spyOn>;
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  const mockAuthService = {
    verifyToken: vi.fn(),
  };

  const mockRabbitMQService = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    forwardMessageToAgent: vi.fn(),
  };

  const mockCentOpsService = {
    getCentOpsConfigurations: vi.fn(),
  };

  // Helper function to create mock sockets
  const createMockSocket = (id: string, agentId?: string): Socket => {
    const mockSocket: Partial<Socket> = {
      id,
      handshake: {
        auth: { token: 'test-token' },
        headers: { authorization: 'Bearer test-token' },
        query: {},
        address: '',
        time: new Date().toISOString(),
        issued: Date.now(),
        url: '',
        secure: false,
        xdomain: false,
      } as any,
      disconnect: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
      agent: agentId ? { sub: agentId, iat: 123, exp: 456 } : undefined,
    };
    return mockSocket as Socket;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentGateway,
        { provide: AuthService, useValue: mockAuthService },
        { provide: RabbitMQService, useValue: mockRabbitMQService },
        { provide: CentOpsService, useValue: mockCentOpsService },
        {
          provide: EventEmitter2,
          useValue: {
            emit: vi.fn(),
            on: vi.fn(),
            once: vi.fn(),
            removeListener: vi.fn(),
            removeAllListeners: vi.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<AgentGateway>(AgentGateway);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    rabbitMQService = module.get<RabbitMQService>(RabbitMQService);

    // Create mock server with sockets collection
    const socketsMap = new Map<string, Socket>();
    serverMock = {
      sockets: {
        sockets: socketsMap,
        get: vi.fn((id: string) => socketsMap.get(id)),
      },
      emit: vi.fn(),
    } as any as Server;
    gateway.server = serverMock;

    // Mock logger methods
    loggerSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    loggerWarnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    loggerErrorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    loggerSpy.mockRestore();
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  describe('Message forwarding from RabbitMQ to Socket.IO', () => {
    it('should forward messages to the correct agent socket', () => {
      // Create mock sockets and add them to the server's sockets collection
      const agentId = 'test-agent-id';
      const socket1 = createMockSocket('socket-1', agentId);
      const socket2 = createMockSocket('socket-2', agentId);
      const socket3 = createMockSocket('socket-3', 'different-agent-id');

      // Add sockets to the server's sockets collection
      (serverMock.sockets.sockets as Map<string, Socket>).set('socket-1', socket1);
      (serverMock.sockets.sockets as Map<string, Socket>).set('socket-2', socket2);
      (serverMock.sockets.sockets as Map<string, Socket>).set('socket-3', socket3);

      // Create a test message
      const testMessage: AgentEncryptedMessageDto = {
        id: 'test-message-id',
        timestamp: new Date().toISOString(),
        senderId: 'dmr-server',
        recipientId: agentId,
        type: MessageType.Message,
        payload: JSON.stringify({ test: 'data' }),
      };

      // Trigger the onRabbitMQMessage event
      gateway.onRabbitMQMessage({ agentId, message: testMessage });

      // Verify that the message was emitted to the correct sockets
      expect(socket1.emit).toHaveBeenCalledWith(
        AgentEventNames.MESSAGE_FROM_DMR_SERVER,
        testMessage,
      );
      expect(socket2.emit).toHaveBeenCalledWith(
        AgentEventNames.MESSAGE_FROM_DMR_SERVER,
        testMessage,
      );
      expect(socket3.emit).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        `Message forwarded to 2 socket(s) for agent ${agentId}`,
      );
    });

    it('should log a warning when no sockets are found for an agent', () => {
      const agentId = 'non-existent-agent';
      const testMessage: AgentEncryptedMessageDto = {
        id: 'test-message-id',
        timestamp: new Date().toISOString(),
        senderId: 'dmr-server',
        recipientId: agentId,
        type: MessageType.Message,
        payload: JSON.stringify({ test: 'data' }),
      };

      // Trigger the onRabbitMQMessage event for an agent with no connected sockets
      gateway.onRabbitMQMessage({ agentId, message: testMessage });

      // Verify that a warning was logged
      expect(loggerWarnSpy).toHaveBeenCalledWith(`No connected sockets found for agent ${agentId}`);
      expect(loggerSpy).not.toHaveBeenCalled();
    });

    it('should handle errors during message forwarding', () => {
      // Create a mock socket that throws an error when emit is called
      const agentId = 'error-agent';
      const socket = createMockSocket('socket-error', agentId);
      socket.emit = vi.fn().mockImplementation(() => {
        throw new Error('Socket emit error');
      });

      (serverMock.sockets.sockets as Map<string, Socket>).set('socket-error', socket);

      const testMessage: AgentEncryptedMessageDto = {
        id: 'test-message-id',
        timestamp: new Date().toISOString(),
        senderId: 'dmr-server',
        recipientId: agentId,
        type: MessageType.Message,
        payload: JSON.stringify({ test: 'data' }),
      };

      // Trigger the onRabbitMQMessage event
      gateway.onRabbitMQMessage({ agentId, message: testMessage });

      // Verify that the error was logged
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error forwarding RabbitMQ message to agent: Socket emit error`,
      );
    });

    it('should handle non-Error objects in error handling', () => {
      // Create a mock socket that throws a non-Error object when emit is called
      const agentId = 'non-error-agent';
      const socket = createMockSocket('socket-non-error', agentId);
      socket.emit = vi.fn().mockImplementation(() => {
        throw 'String error'; // Not an Error object
      });

      (serverMock.sockets.sockets as Map<string, Socket>).set('socket-non-error', socket);

      const testMessage: AgentEncryptedMessageDto = {
        id: 'test-message-id',
        timestamp: new Date().toISOString(),
        senderId: 'dmr-server',
        recipientId: agentId,
        type: MessageType.Message,
        payload: JSON.stringify({ test: 'data' }),
      };

      // Trigger the onRabbitMQMessage event
      gateway.onRabbitMQMessage({ agentId, message: testMessage });

      // Verify that the error was logged with String conversion
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error forwarding RabbitMQ message to agent: String error`,
      );
    });
  });
});
