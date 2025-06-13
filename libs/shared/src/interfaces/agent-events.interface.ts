/**
 * Interface for agent list events between DMR Server and DMR Agent
 */

/**
 * Event names for agent list synchronization
 */
export enum AgentEventNames {
  FULL_AGENT_LIST = 'dmr:agents:full-list',
  PARTIAL_AGENT_LIST = 'dmr:agents:partial-list',
  AGENT_CONNECTED = 'dmr:agent:connected',
  AGENT_DISCONNECTED = 'dmr:agent:disconnected',
}

/**
 * Interface for agent information
 */
export interface IAgentInfo {
  id: string;
  name: string;
  status: AgentStatus;
  lastConnected?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Agent status enum
 */
export enum AgentStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy',
  AWAY = 'away',
}

/**
 * Interface for full agent list event payload
 */
export interface IFullAgentListEvent {
  agents: IAgentInfo[];
  timestamp: Date;
}

/**
 * Interface for partial agent list event payload
 */
export interface IPartialAgentListEvent {
  agents: IAgentInfo[];
  timestamp: Date;
}

/**
 * Interface for agent connected/disconnected event payload
 */
export interface IAgentStatusEvent {
  agent: IAgentInfo;
  timestamp: Date;
}
