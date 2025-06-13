import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { WebsocketService } from '../websocket/websocket.service';
import {
  AgentEventNames,
  AgentStatus,
  IAgentInfo,
  IFullAgentListEvent,
  IPartialAgentListEvent,
} from '@dmr/shared';

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

    // Listen for full agent list updates
    socket.on(AgentEventNames.FULL_AGENT_LIST, (data: IFullAgentListEvent) => {
      void this.handleFullAgentListEvent(data);
    });

    // Listen for partial agent list updates
    socket.on(AgentEventNames.PARTIAL_AGENT_LIST, (data: IPartialAgentListEvent) => {
      void this.handlePartialAgentListEvent(data);
    });

    // Listen for individual agent connection events
    socket.on(AgentEventNames.AGENT_CONNECTED, (data: { agent: IAgentInfo }) => {
      void this.handleAgentStatusChange(data.agent, AgentStatus.ONLINE);
    });

    // Listen for individual agent disconnection events
    socket.on(AgentEventNames.AGENT_DISCONNECTED, (data: { agent: IAgentInfo }) => {
      void this.handleAgentStatusChange(data.agent, AgentStatus.OFFLINE);
    });

    this.logger.log('Agent event listeners set up successfully');
  }

  /**
   * Handle full agent list event
   */
  private async handleFullAgentListEvent(data: IFullAgentListEvent): Promise<void> {
    try {
      // Store the complete agent list in cache
      await this.cacheManager.set(this.AGENTS_CACHE_KEY, data.agents, 0);
      this.logger.log(`Received full agent list with ${data.agents.length} agents`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error handling full agent list: ${errorMessage}`);
    }
  }

  /**
   * Handle partial agent list event
   */
  private async handlePartialAgentListEvent(data: IPartialAgentListEvent): Promise<void> {
    try {
      // Get the current agent list from cache
      const currentAgents: IAgentInfo[] =
        (await this.cacheManager.get(this.AGENTS_CACHE_KEY)) || [];

      // Create a map for faster lookups
      const agentMap: Map<string, IAgentInfo> = new Map();
      currentAgents.forEach((agent) => agentMap.set(agent.id, agent));

      // Update or add agents from the partial list
      data.agents.forEach((agent) => {
        agentMap.set(agent.id, agent);
      });

      // Convert map back to array
      const updatedAgents: IAgentInfo[] = Array.from(agentMap.values());

      // Store updated list in cache
      await this.cacheManager.set(this.AGENTS_CACHE_KEY, updatedAgents, 0);
      this.logger.log(
        `Updated agent list with ${data.agents.length} agents, total: ${updatedAgents.length}`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error handling partial agent list: ${errorMessage}`);
    }
  }

  /**
   * Handle individual agent status change
   */
  private async handleAgentStatusChange(agent: IAgentInfo, status: AgentStatus): Promise<void> {
    try {
      // Get the current agent list from cache
      const currentAgents: IAgentInfo[] =
        (await this.cacheManager.get(this.AGENTS_CACHE_KEY)) || [];

      // Create a map for faster lookups
      const agentMap: Map<string, IAgentInfo> = new Map();
      currentAgents.forEach((a) => agentMap.set(a.id, a));

      // Update or add the agent with new status
      agent.status = status;
      agent.lastConnected = status === AgentStatus.ONLINE ? new Date() : agent.lastConnected;
      agentMap.set(agent.id, agent);

      // Convert map back to array
      const updatedAgents: IAgentInfo[] = Array.from(agentMap.values());

      // Store updated list in cache
      await this.cacheManager.set(this.AGENTS_CACHE_KEY, updatedAgents, 0);
      this.logger.log(`Agent ${agent.id} status changed to ${status}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error handling agent status change: ${errorMessage}`);
    }
  }

  /**
   * Get all agents from cache
   */
  async getAllAgents(): Promise<IAgentInfo[]> {
    try {
      const agents: IAgentInfo[] = (await this.cacheManager.get(this.AGENTS_CACHE_KEY)) || [];
      return agents;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error getting agents: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Get agent by ID
   */
  async getAgentById(id: string): Promise<IAgentInfo | null> {
    try {
      const agents: IAgentInfo[] = (await this.cacheManager.get(this.AGENTS_CACHE_KEY)) || [];
      return agents.find((agent) => agent.id === id) || null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error getting agent by ID: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Get online agents
   */
  async getOnlineAgents(): Promise<IAgentInfo[]> {
    try {
      const agents: IAgentInfo[] = (await this.cacheManager.get(this.AGENTS_CACHE_KEY)) || [];
      return agents.filter((agent) => agent.status === AgentStatus.ONLINE);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error getting online agents: ${errorMessage}`);
      return [];
    }
  }
}
