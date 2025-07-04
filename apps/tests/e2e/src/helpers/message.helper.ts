import { AgentMessageDto } from '@dmr/shared';

interface SendMessageResult {
  success: boolean;
  error?: string;
}

export const sendMessage = async (message: AgentMessageDto): Promise<SendMessageResult> => {
  try {
    const response = await fetch(`${process.env.EXTERNAL_SERVICE_A_URL}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
};
