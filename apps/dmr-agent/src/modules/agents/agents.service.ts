import { AgentEventNames, IAgent, IAgentList } from '@dmr/shared';

import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WebsocketService } from '../websocket/websocket.service';

@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly AGENTS_CACHE_KEY = 'DMR_AGENTS_LIST';
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly websocketService: WebsocketService,
  ) {}

  onModuleInit(): void {
    this.setupSocketEventListeners();
  }

  private setupSocketEventListeners(): void {
    if (!this.websocketService.isConnected()) {
      this.logger.warn(
        'WebSocket is not connected. Will retry setting up agent event listeners when connected.',
      );
      return;
    }

    const socket = this.websocketService.getSocket();

    if (!socket) {
      this.logger.error(
        'Failed to get socket instance even though connection was reported as active',
      );
      return;
    }

    socket.on(AgentEventNames.FULL_AGENT_LIST, (data: IAgentList) => {
      void this.handleFullAgentListEvent(data);
    });

    socket.on(AgentEventNames.PARTIAL_AGENT_LIST, (data: IAgentList) => {
      void this.handlePartialAgentListEvent(data);
    });
  }

  private async handleFullAgentListEvent(data: IAgentList): Promise<void> {
    try {
      const activeAgents = data.response.filter((agent) => !agent.deleted);
      await this.cacheManager.set(this.AGENTS_CACHE_KEY, activeAgents);
      this.logger.log(`Received full agent list with ${activeAgents.length} active agents`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error handling full agent list: ${errorMessage}`);
    }
  }

  private async handlePartialAgentListEvent(data: IAgentList): Promise<void> {
    try {
      const currentAgents = (await this.cacheManager.get(this.AGENTS_CACHE_KEY)) || [];

      const agentMap: Map<string, IAgent> = new Map();
      if (Array.isArray(currentAgents)) {
        currentAgents.forEach((agent: IAgent) => agentMap.set(agent.id, agent));
      }

      if (data.response && Array.isArray(data.response)) {
        data.response.forEach((agent: IAgent) => {
          if (agent.id) {
            if (agent.deleted) {
              if (agentMap.has(agent.id)) {
                agentMap.delete(agent.id);
              }
            } else {
              agentMap.set(agent.id, agent);
            }
          }
        });
      }

      const updatedAgents = Array.from(agentMap.values());

      await this.cacheManager.set(this.AGENTS_CACHE_KEY, updatedAgents, 0);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error handling partial agent list: ${errorMessage}`);
    }
  }

  async getAllAgents(): Promise<IAgent[]> {
    try {
      const agents: IAgent[] = (await this.cacheManager.get(this.AGENTS_CACHE_KEY)) || [];
      return agents;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error getting agents: ${errorMessage}`);
      return [];
    }
  }

  async getAgentById(id: string): Promise<IAgent | null> {
    try {
      const agents: IAgent[] = (await this.cacheManager.get(this.AGENTS_CACHE_KEY)) || [];
      return agents.find((agent) => agent.id === id) || null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error getting agent by ID: ${errorMessage}`);
      return null;
    }
  }
}
