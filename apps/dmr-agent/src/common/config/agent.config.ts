import { Utils } from '@dmr/shared';
import { ConfigType, registerAs } from '@nestjs/config';
import Joi from 'joi';

export const AGENT_CONFIG_TOKEN = Symbol('AGENT_CONFIG_TOKEN');

const variables = Utils.validateObject(
  {
    id: String(process.env.AGENT_ID),
    privateKey: String(process.env.AGENT_PRIVATE_KEY),
    webhookEndpoint: String(process.env.AGENT_WEBHOOK_ENDPOINT || ''),
  },
  {
    id: Joi.string().uuid().required(),
    privateKey: Joi.string().required(),
    webhookEndpoint: Joi.string().allow(''),
  },
);

export const agentConfig = registerAs(AGENT_CONFIG_TOKEN, () => variables);

export type AgentConfig = ConfigType<typeof agentConfig>;
