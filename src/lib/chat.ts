export type ChatUser = {
  uid: string
  username: string
  displayName: string
  photoURL: string
}

export type ChatMessage = {
  id: string
  senderId: string
  recipientId: string
  text: string
  createdAt: unknown
}

export type ChatConversation = {
  id: string
  user: ChatUser
  lastMessageText: string
  lastMessageSenderId: string
  lastMessageAt: unknown
}

export const MAX_CHAT_MESSAGE_LENGTH = 4000

export function createConversationId(firstUid: string, secondUid: string): string {
  if (!firstUid || !secondUid || firstUid === secondUid) {
    throw new Error('A conversation requires two different Chater accounts.')
  }
  return [firstUid, secondUid].sort().map(uid => encodeURIComponent(uid)).join('__')
}

export function normalizeChatMessage(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim()
}

export function isValidChatMessage(value: string): boolean {
  const normalized = normalizeChatMessage(value)
  return normalized.length > 0 && normalized.length <= MAX_CHAT_MESSAGE_LENGTH
}

export function timestampToMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis
    if (typeof toMillis === 'function') {
      try {
        const millis = (toMillis as (this: unknown) => number).call(value)
        return Number.isFinite(millis) ? millis : 0
      } catch {
        return 0
      }
    }
  }
  return 0
}
