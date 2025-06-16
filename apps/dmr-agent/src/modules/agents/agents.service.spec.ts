import { IAgent, IAgentList } from '@dmr/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebsocketService } from '../websocket/websocket.service';
import { AgentsService } from './agents.service';

describe('AgentsService', () => {
  let service: AgentsService;
  let mockWebsocketService: WebsocketService;
  let mockCacheManager: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any, ttl?: number) => Promise<void>;
  };

  const agent1: IAgent = {
    id: '1',
    name: 'Agent 1',
    authentication_certificate: 'cert1',
    created_at: '2023-01-01',
    updated_at: '2023-01-02',
  };

  const agent2: IAgent = {
    id: '2',
    name: 'Agent 2',
    authentication_certificate: 'cert2',
    created_at: '2023-01-03',
    updated_at: '2023-01-04',
  };

  const deletedAgent: IAgent = {
    id: '3',
    name: 'Deleted Agent',
    authentication_certificate: 'cert3',
    created_at: '2023-01-05',
    updated_at: '2023-01-06',
    deleted: true,
  };

  beforeEach(() => {
    mockWebsocketService = {
      isConnected: vi.fn(),
      getSocket: vi.fn(),
    } as any;

    mockCacheManager = {
      get: vi.fn(),
      set: vi.fn(),
    };

    service = new AgentsService(mockCacheManager as any, mockWebsocketService);
  });

  it('should call setupSocketEventListeners on module init', () => {
    const setupSpy = vi.spyOn(service as any, 'setupSocketEventListeners');
    service.onModuleInit();
    expect(setupSpy).toHaveBeenCalled();
  });

  it('should store full agent list on full list event', async () => {
    const data: IAgentList = {
      response: [agent1, deletedAgent, agent2],
    };

    await (service as any).handleFullAgentListEvent(data);

    expect(mockCacheManager.set).toHaveBeenCalledWith('DMR_AGENTS_LIST', [
      agent1,
      deletedAgent,
      agent2,
    ]);
  });

  it('should update and delete agents correctly on partial list event', async () => {
    mockCacheManager.get = vi.fn().mockResolvedValue([agent1]);

    const update: IAgentList = {
      response: [{ ...agent2 }, { ...agent1, deleted: true }],
    };

    await (service as any).handlePartialAgentListEvent(update);

    expect(mockCacheManager.set).toHaveBeenCalledWith('DMR_AGENTS_LIST', [agent2], 0);
  });

  it('should get all agents from cache', async () => {
    mockCacheManager.get = vi.fn().mockResolvedValue([agent1, agent2]);

    const result = await service.getAllAgents();
    expect(result).toEqual([agent1, agent2]);
  });

  it('should return empty list on getAllAgents error', async () => {
    mockCacheManager.get = vi.fn().mockRejectedValue(new Error('Cache error'));

    const result = await service.getAllAgents();
    expect(result).toEqual([]);
  });

  it('should get agent by ID from cache', async () => {
    mockCacheManager.get = vi.fn().mockResolvedValue([agent1, agent2]);

    const result = await service.getAgentById('2');
    expect(result).toEqual(agent2);
  });

  it('should return null if agent ID is not found', async () => {
    mockCacheManager.get = vi.fn().mockResolvedValue([agent1]);

    const result = await service.getAgentById('not-found');
    expect(result).toBeNull();
  });

  it('should return null if getAgentById throws error', async () => {
    mockCacheManager.get = vi.fn().mockRejectedValue(new Error('error'));

    const result = await service.getAgentById('1');
    expect(result).toBeNull();
  });
});
