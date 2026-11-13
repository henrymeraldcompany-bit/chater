export const CHATER_MEDIA_BASE_URL = (
  import.meta.env.VITE_CHATER_MEDIA_URL ||
  'https://chater-media.henrymeraldcompany.workers.dev'
).replace(/\/$/, '')

export type ChaterMediaCategory = 'profile' | 'moment' | 'wallpaper'
export type ChaterWallpaperScope = 'general' | 'chat'

type TokenUser = {
  uid: string
  getIdToken(forceRefresh?: boolean): Promise<string>
}

type ChaterMediaUploadOptions = {
  category: ChaterMediaCategory
  scope?: ChaterWallpaperScope
  conversationId?: string
  timeoutMs?: number
}

type ChaterMediaUploadResponse = {
  success?: boolean
  url?: string
  objectKey?: string
  error?: string
}

export function isChaterMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  try {
    const candidate = new URL(value)
    const configured = new URL(CHATER_MEDIA_BASE_URL)
    return candidate.protocol === 'https:' &&
      candidate.origin === configured.origin &&
      candidate.pathname.startsWith('/media/users/')
  } catch {
    return false
  }
}

export async function deleteChaterMedia(user: TokenUser, mediaUrl: string): Promise<void> {
  if (!isChaterMediaUrl(mediaUrl)) {
    throw new Error('This is not a Chater Cloudflare R2 media URL.')
  }

  let objectKey: string
  try {
    const url = new URL(mediaUrl)
    const rawKey = url.pathname.slice('/media/'.length)
    objectKey = rawKey.split('/').map(decodeURIComponent).join('/')
  } catch {
    throw new Error('Chater could not identify this stored media file.')
  }

  const allowedKey = /^users\/[A-Za-z0-9_-]{1,128}\/(?:profile\/[A-Za-z0-9_.-]+|moments\/[A-Za-z0-9_.-]+|wallpapers\/(?:general\/[A-Za-z0-9_.-]+|chats\/[A-Za-z0-9_%-]{1,512}\/[A-Za-z0-9_.-]+))$/
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(user.uid) ||
    !objectKey.startsWith('users/' + user.uid + '/') ||
    !allowedKey.test(objectKey) ||
    objectKey.includes('..') ||
    objectKey.length > 1200
  ) {
    throw new Error('You can only remove media uploaded to your own Chater account.')
  }

  const token = await user.getIdToken()
  const response = await fetch(CHATER_MEDIA_BASE_URL + '/object', {
    method: 'DELETE',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ objectKey }),
  })
  const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string }
  if (!response.ok || result.success !== true) {
    throw new Error(result.error || 'Chater could not delete this file from Cloudflare R2. Please try again.')
  }
}

export async function uploadChaterMedia(
  user: TokenUser,
  file: File,
  options: ChaterMediaUploadOptions,
): Promise<string> {
  const token = await user.getIdToken()
  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + token,
    'Content-Type': file.type,
    'X-Chater-Media-Category': options.category,
  }
  if (options.scope) headers['X-Chater-Media-Scope'] = options.scope
  if (options.conversationId) headers['X-Chater-Conversation-Id'] = options.conversationId

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000)
  try {
    const response = await fetch(CHATER_MEDIA_BASE_URL + '/upload', {
      method: 'POST',
      headers,
      body: file,
      signal: controller.signal,
    })
    const result = await response.json().catch(() => ({})) as ChaterMediaUploadResponse
    if (!response.ok || !result.success || !isChaterMediaUrl(result.url)) {
      throw new Error(result.error || 'Chater could not upload this file to Cloudflare R2. Please try again.')
    }
    return result.url
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The upload took too long. Check your connection and try again.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
