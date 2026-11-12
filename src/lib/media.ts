export const CHATER_MEDIA_BASE_URL = (
  import.meta.env.VITE_CHATER_MEDIA_URL ||
  'https://chater-media.henrymeraldcompany.workers.dev'
).replace(/\/$/, '')

export type ChaterMediaCategory = 'profile' | 'moment' | 'wallpaper'
export type ChaterWallpaperScope = 'general' | 'chat'

type TokenUser = {
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

export async function uploadChaterMedia(
  user: TokenUser,
  file: File,
  options: ChaterMediaUploadOptions,
): Promise<string> {
  const token = await user.getIdToken()
  const formData = new FormData()
  formData.append('file', file)
  formData.append('category', options.category)
  if (options.scope) formData.append('scope', options.scope)
  if (options.conversationId) formData.append('conversationId', options.conversationId)

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000)
  try {
    const response = await fetch(CHATER_MEDIA_BASE_URL + '/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: formData,
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
