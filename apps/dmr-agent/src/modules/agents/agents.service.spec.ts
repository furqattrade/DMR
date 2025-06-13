import { Test, TestingModule } from '@nestjs/testing';
import { AgentsService } from './agents.service';
import { WebsocketService } from '../websocket/websocket.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AgentEventNames, AgentStatus, IAgentInfo } from '@dmr/shared';
import { Socket } from 'socket.io-client';
import { Logger } from '@nestjs/common';

describe('AgentsService', () => {
  let service: AgentsService;
  let websocketService: WebsocketService;
  let cacheManager: { get: jest.Mock; set: jest.Mock };
  let mockSocket: Partial<Socket>;

  beforeEach(async () => {
    // Mock socket with event listeners
    mockSocket = {
      on: jest.fn(),
      connected: true,
    };

    // Mock cache manager
    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
    };

    // Mock websocket service
    const mockWebsocketService = {
      isConnected: jest.fn().mockReturnValue(true),
      getSocket: jest.fn().mockReturnValue(mockSocket),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        {
          provide: WebsocketService,
          useValue: mockWebsocketService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: cacheManager,
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
    websocketService = module.get<WebsocketService>(WebsocketService);

    // Spy on logger
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should set up socket event listeners when socket is connected', () => {
      service.onModuleInit();

      expect(websocketService.isConnected).toHaveBeenCalled();
      expect(mockSocket.on).toHaveBeenCalledWith(
        AgentEventNames.FULL_AGENT_LIST,
        expect.any(Function),
      );
      expect(mockSocket.on).toHaveBeenCalledWith(
        AgentEventNames.PARTIAL_AGENT_LIST,
        expect.any(Function),
      );
      expect(mockSocket.on).toHaveBeenCalledWith(
        AgentEventNames.AGENT_CONNECTED,
        expect.any(Function),
      );
      expect(mockSocket.on).toHaveBeenCalledWith(
        AgentEventNames.AGENT_DISCONNECTED,
        expect.any(Function),
      );
    });

    it('should log warning when socket is not connected', () => {
      jest.spyOn(websocketService, 'isConnected').mockReturnValueOnce(false);
      service.onModuleInit();

      expect(websocketService.isConnected).toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('WebSocket is not connected'),
      );
      expect(mockSocket.on).not.toHaveBeenCalled();
    });
  });

  describe('getAllAgents', () => {
    it('should return agents from cache', async () => {
      const mockAgents: IAgentInfo[] = [
        {
          id: 'agent1',
          name: 'Agent 1',
          status: AgentStatus.ONLINE,
        },
        {
          id: 'agent2',
          name: 'Agent 2',
          status: AgentStatus.OFFLINE,
        },
      ];

      cacheManager.get.mockResolvedValueOnce(mockAgents);
      const result = await service.getAllAgents();

      expect(cacheManager.get).toHaveBeenCalledWith('DMR_AGENTS_LIST');
      expect(result).toEqual(mockAgents);
    });

    it('should return empty array when cache is empty', async () => {
      cacheManager.get.mockResolvedValueOnce(null);
      const result = await service.getAllAgents();

      expect(cacheManager.get).toHaveBeenCalledWith('DMR_AGENTS_LIST');
      expect(result).toEqual([]);
    });

    it('should handle errors and return empty array', async () => {
      cacheManager.get.mockRejectedValueOnce(new Error('Cache error'));
      const result = await service.getAllAgents();

      expect(cacheManager.get).toHaveBeenCalledWith('DMR_AGENTS_LIST');
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('Error getting agents'),
      );
      expect(result).toEqual([]);
    });
  });

  describe('getAgentById', () => {
    it('should return agent by ID when found', async () => {
      const mockAgents: IAgentInfo[] = [
        {
          id: 'agent1',
          name: 'Agent 1',
          status: AgentStatus.ONLINE,
        },
        {
          id: 'agent2',
          name: 'Agent 2',
          status: AgentStatus.OFFLINE,
        },
      ];

      cacheManager.get.mockResolvedValueOnce(mockAgents);
      const result = await service.getAgentById('agent1');

      expect(cacheManager.get).toHaveBeenCalledWith('DMR_AGENTS_LIST');
      expect(result).toEqual(mockAgents[0]);
    });

    it('should return null when agent not found', async () => {
      const mockAgents: IAgentInfo[] = [
        {
          id: 'agent1',
          name: 'Agent 1',
          status: AgentStatus.ONLINE,
        },
      ];

      cacheManager.get.mockResolvedValueOnce(mockAgents);
      const result = await service.getAgentById('agent2');

      expect(cacheManager.get).toHaveBeenCalledWith('DMR_AGENTS_LIST');
      expect(result).toBeNull();
    });
  });

  describe('getOnlineAgents', () => {
    it('should return only online agents', async () => {
      const mockAgents: IAgentInfo[] = [
        {
          id: 'agent1',
          name: 'Agent 1',
          status: AgentStatus.ONLINE,
        },
        {
          id: 'agent2',
          name: 'Agent 2',
          status: AgentStatus.OFFLINE,
        },
        {
          id: 'agent3',
          name: 'Agent 3',
          status: AgentStatus.ONLINE,
        },
      ];

      cacheManager.get.mockResolvedValueOnce(mockAgents);
      const result = await service.getOnlineAgents();

      expect(cacheManager.get).toHaveBeenCalledWith('DMR_AGENTS_LIST');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('agent1');
      expect(result[1].id).toBe('agent3');
    });
  });
});
