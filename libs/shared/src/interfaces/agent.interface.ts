import { IAgentConfig } from './centops.interface';

export interface IAgent extends IAgentConfig {
  deleted?: boolean;
}
export interface IAgentList {
  response: IAgent[];
}
