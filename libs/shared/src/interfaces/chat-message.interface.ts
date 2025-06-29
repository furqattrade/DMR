export interface ChatMessagePayload {
  chat: Chat;
  messages: ChatMessage[];
}

export interface Chat {
  id: string; // UUID
  endUserFirstName?: string;
  endUserLastName?: string;
  endUserId?: string;
  endUserEmail?: string;
  endUserPhone?: string;
  customerSupportDisplayName?: string;
  created: string;
  endUserOs?: string;
  endUserUrl?: string;
}

export interface ChatMessage {
  id: string; // UUID
  chatId: string; // UUID
  content?: string;
  event?: string;
  csaTitle?: string;
  authorId?: string;
  authorTimestamp: string;
  authorFirstName: string;
  authorLastName?: string;
  authorRole: string;
  forwardedByUser: string;
  forwardedFromCsa: string;
  forwardedToCsa: string;
  originalBaseId?: string;
  originalCreated?: string;
  rating?: string;
  created?: string;
  preview?: string;
  updated?: string;
  buttons?: string;
  options?: string;
}
