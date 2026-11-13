import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHATER_MEDIA_BASE_URL, deleteChaterMedia } from './media'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Chater R2 media deletion', () => {
  it('deletes an authenticated user-owned object by its decoded R2 key', async () => {
    const user = { uid: 'member_123', getIdToken: vi.fn(async () => 'test-id-token') }
    const mediaUrl = CHATER_MEDIA_BASE_URL + '/media/users/member_123/wallpapers/general/background%20image.png'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    }))

    await deleteChaterMedia(user, mediaUrl)

    expect(fetch).toHaveBeenCalledWith(CHATER_MEDIA_BASE_URL + '/object', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer test-id-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ objectKey: 'users/member_123/wallpapers/general/background image.png' })
    })
  })

  it('rejects another account’s media before making a network request', async () => {
    const user = { uid: 'member_123', getIdToken: vi.fn(async () => 'test-id-token') }
    const otherUsersMedia = CHATER_MEDIA_BASE_URL + '/media/users/someone_else/profile/avatar.png'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteChaterMedia(user, otherUsersMedia)).rejects.toThrow('You can only remove media uploaded to your own Chater account.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports an unsuccessful R2 deletion without claiming success', async () => {
    const user = { uid: 'member_123', getIdToken: vi.fn(async () => 'test-id-token') }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: 'R2 deletion denied' })
    }))

    await expect(deleteChaterMedia(
      user,
      CHATER_MEDIA_BASE_URL + '/media/users/member_123/profile/avatar.png'
    )).rejects.toThrow('R2 deletion denied')
  })
})
