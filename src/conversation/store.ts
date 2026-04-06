import { v4 as uuidv4 } from "uuid";
import type { ChatMessage } from "../client/types.js";

const MAX_MESSAGES_PER_CONVERSATION = 50;

export class ConversationStore {
  private conversations = new Map<string, ChatMessage[]>();

  create(systemPrompt?: string): string {
    const id = uuidv4();
    const messages: ChatMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    this.conversations.set(id, messages);
    return id;
  }

  append(id: string, role: ChatMessage["role"], content: string): void {
    const messages = this.conversations.get(id);
    if (!messages) {
      throw new Error(`Conversation not found: ${id}`);
    }

    const updated = [...messages, { role, content }];

    // Trim oldest non-system messages if over limit
    const systemMessages = updated.filter(m => m.role === "system");
    const nonSystemMessages = updated.filter(m => m.role !== "system");
    if (nonSystemMessages.length > MAX_MESSAGES_PER_CONVERSATION) {
      const trimmed = nonSystemMessages.slice(-MAX_MESSAGES_PER_CONVERSATION);
      this.conversations.set(id, [...systemMessages, ...trimmed]);
    } else {
      this.conversations.set(id, updated);
    }
  }

  getMessages(id: string): ChatMessage[] {
    const messages = this.conversations.get(id);
    if (!messages) {
      throw new Error(`Conversation not found: ${id}`);
    }
    return [...messages];
  }

  has(id: string): boolean {
    return this.conversations.has(id);
  }

  clear(id: string): void {
    this.conversations.delete(id);
  }

  clearAll(): void {
    this.conversations.clear();
  }
}
