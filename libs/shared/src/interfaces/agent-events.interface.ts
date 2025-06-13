import { IAgentConfig } from './centops.interface';

export enum AgentEventNames {
  FULL_AGENT_LIST = 'dmr:agents:full-list',
  PARTIAL_AGENT_LIST = 'dmr:agents:partial-list',
}
export interface IAgent extends IAgentConfig {
  deleted?: boolean;
}
export interface IAgentList {
  response: IAgent[];
}
