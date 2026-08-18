import type { ArchiveSection, UniversalConversation } from "../../domain/conversation";

export interface ArchiveStatistics {
  totals: { conversations: number; messages: number; attachments: number; sections: number; branches: number };
}

export function inspectArchive(conversations: UniversalConversation[], sections: ArchiveSection[]): ArchiveStatistics {
  let branches = 0;
  conversations.forEach((conversation) => {
    const children = new Map<string, number>();
    conversation.messages.forEach((message) => {
      if (message.parentMessageId) {
        children.set(message.parentMessageId, (children.get(message.parentMessageId) || 0) + 1);
      }
    });
    branches += [...children.values()].filter((count) => count > 1).length;
  });
  return {
    totals: { conversations: conversations.length, messages: conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0), attachments: conversations.reduce((sum, conversation) => sum + conversation.attachments.length, 0), sections: sections.reduce((sum, section) => sum + section.items.length, 0), branches },
  };
}
