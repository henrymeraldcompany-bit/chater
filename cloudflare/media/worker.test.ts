import { afterEach, describe, expect, it, vi } from 'vitest'
import mediaWorker from './worker.js'

describe('Chater R2 Moment expiry worker', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deletes only Moment objects whose 24-hour expiry has passed', async () => {
    const now = Date.now()
    const media = {
      list: vi.fn(async () => ({
        objects: [
          {
            key: 'users/member_1/moments/expired.png',
            uploaded: new Date(now - 25 * 60 * 60 * 1000),
            customMetadata: {},
          },
          {
            key: 'users/member_1/moments/active.png',
            uploaded: new Date(now - 23 * 60 * 60 * 1000),
            customMetadata: {},
          },
          {
            key: 'users/member_1/moments/expiry-extended.png',
            uploaded: new Date(now - 26 * 60 * 60 * 1000),
            customMetadata: { expiresAt: String(now + 60_000) },
          },
          {
            key: 'users/member_1/profile/avatar.png',
            uploaded: new Date(now - 30 * 24 * 60 * 60 * 1000),
            customMetadata: {},
          },
          {
            key: 'users/member_2/wallpapers/general/photo.png',
            uploaded: new Date(now - 30 * 24 * 60 * 60 * 1000),
            customMetadata: {},
          },
        ],
        truncated: false,
      })),
      delete: vi.fn(async () => undefined),
    }
    let scheduledWork: Promise<unknown> | undefined
    const context = {
      waitUntil: (promise: Promise<unknown>) => { scheduledWork = promise },
    }

    await mediaWorker.scheduled({}, { MEDIA: media }, context)
    await scheduledWork

    expect(media.list).toHaveBeenCalledWith({
      prefix: 'users/',
      cursor: undefined,
      limit: 1000,
      include: ['customMetadata'],
    })
    expect(media.delete).toHaveBeenCalledTimes(1)
    expect(media.delete).toHaveBeenCalledWith(['users/member_1/moments/expired.png'])
  })

  it('uses the R2 upload time as a fallback for older Moment files without expiry metadata', async () => {
    const now = Date.now()
    const media = {
      list: vi.fn(async () => ({
        objects: [{
          key: 'users/member_3/moments/legacy.mp4',
          uploaded: new Date(now - 25 * 60 * 60 * 1000),
          customMetadata: { category: 'moment' },
        }],
        truncated: false,
      })),
      delete: vi.fn(async () => undefined),
    }
    let scheduledWork: Promise<unknown> | undefined

    await mediaWorker.scheduled({}, { MEDIA: media }, {
      waitUntil: (promise: Promise<unknown>) => { scheduledWork = promise },
    })
    await scheduledWork

    expect(media.delete).toHaveBeenCalledWith(['users/member_3/moments/legacy.mp4'])
  })
})
