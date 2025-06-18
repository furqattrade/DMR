import { AgentEncryptedMessageDto, AgentEventNames, MessageType } from '@dmr/shared';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'socket.io';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RabbitMQService } from '../../libs/rabbitmq';
import { AuthService } from '../auth/auth.service';
import { CentOpsService } from '../centops/centops.service';
import { AgentGateway } from './agent.gateway';

describe('Agent Gateway Message Handling', () => {
  let gateway: AgentGateway;
  let mockSockets: Map<string, any>;

  beforeEach(async () => {
    mockSockets = new Map<string, any>();

    const mockSocket1 = {
      id: 'socket-1',
      agent: {
        sub: 'agent-123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      emit: vi.fn(),
    };

    const mockSocket2 = {
      id: 'socket-2',
      agent: {
        sub: 'agent-456',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      emit: vi.fn(),
    };

    mockSockets.set('socket-1', mockSocket1);
    mockSockets.set('socket-2', mockSocket2);
    const mockServer = {
      sockets: {
        sockets: mockSockets,
        emit: vi.fn(),
        to: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        except: vi.fn().mockReturnThis(),
      },
    } as unknown as Server;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentGateway,
        {
          provide: AuthService,
          useValue: {
            validateToken: vi.fn(),
          },
        },
        {
          provide: RabbitMQService,
          useValue: {
            setupQueue: vi.fn(),
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
          },
        },
        {
          provide: CentOpsService,
          useValue: {
            getAgentConfigurations: vi.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<AgentGateway>(AgentGateway);

    (gateway as any).server = mockServer;
  });

  describe('onRabbitMQMessage', () => {
    it('should forward message to the correct agent sockets', () => {
      const testMessage: AgentEncryptedMessageDto = {
        id: 'msg-123',
        timestamp: '2025-06-18T14:00:00Z',
        senderId: 'server-id',
        recipientId: 'agent-123',
        type: MessageType.Message,
        payload: '{"key":"value"}',
      };

      gateway.onRabbitMQMessage({
        agentId: 'agent-123',
        message: testMessage,
      });

      const socket1 = mockSockets.get('socket-1');
      const socket2 = mockSockets.get('socket-2');

      expect(socket1.emit).toHaveBeenCalledWith(
        AgentEventNames.MESSAGE_FROM_DMR_SERVER,
        testMessage,
      );

      expect(socket2.emit).not.toHaveBeenCalled();
    });

    it('should log warning when no sockets found for agent', () => {
      const testMessage: AgentEncryptedMessageDto = {
        id: 'msg-123',
        timestamp: '2025-06-18T14:00:00Z',
        senderId: 'server-id',
        recipientId: 'agent-789',
        type: MessageType.Message,
        payload: '{"key":"value"}',
      };

      const warnSpy = vi.spyOn(gateway['logger'], 'warn');

      gateway.onRabbitMQMessage({
        agentId: 'agent-789',
        message: testMessage,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No connected sockets found for agent agent-789'),
      );
    });

    it('should handle errors during message forwarding', () => {
      const testMessage: AgentEncryptedMessageDto = {
        id: 'msg-123',
        timestamp: '2025-06-18T14:00:00Z',
        senderId: 'server-id',
        recipientId: 'agent-123',
        type: MessageType.Message,
        payload: '{"key":"value"}',
      };

      const socket1 = mockSockets.get('socket-1');
      (socket1.emit as any).mockImplementation(() => {
        throw new Error('Socket error');
      });

      const errorSpy = vi.spyOn(gateway['logger'], 'error');

      gateway.onRabbitMQMessage({
        agentId: 'agent-123',
        message: testMessage,
      });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error forwarding RabbitMQ message to agent: Socket error'),
      );
    });
  });

  describe('findSocketsByAgentId', () => {
    it('should return sockets for the specified agent ID', () => {
      const sockets = (gateway as any).findSocketsByAgentId('agent-123');

      expect(sockets).toHaveLength(1);
      expect(sockets[0].id).toBe('socket-1');
    });

    it('should return empty array when no sockets found', () => {
      const sockets = (gateway as any).findSocketsByAgentId('agent-789');

      expect(sockets).toHaveLength(0);
    });

    it('should handle multiple sockets for the same agent', () => {
      const anotherSocket = {
        id: 'socket-3',
        agent: {
          sub: 'agent-123',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        emit: vi.fn(),
      };

      mockSockets.set('socket-3', anotherSocket);

      const sockets = (gateway as any).findSocketsByAgentId('agent-123');

      expect(sockets).toHaveLength(2);
      expect(sockets.map((s) => s.id).sort()).toEqual(['socket-1', 'socket-3']);
    });
  });
});
