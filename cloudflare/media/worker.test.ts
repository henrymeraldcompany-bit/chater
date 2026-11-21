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

describe('Chater R2 service routes and pagination', () => {
  it('allows hashed Cloudflare Pages preview deployments but rejects unrelated origins', async () => {
    const previewOrigin = 'https://a5652182.chater-r2-preview.pages.dev'
    const allowed = await mediaWorker.fetch(
      new Request('https://chater-r2-test.henrymeraldcompany.workers.dev/health', {
        headers: { origin: previewOrigin }
      }),
      { MEDIA: {} }
    )
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('access-control-allow-origin')).toBe(previewOrigin)

    const rejected = await mediaWorker.fetch(
      new Request('https://chater-r2-test.henrymeraldcompany.workers.dev/health', {
        headers: { origin: 'https://evil.example' }
      }),
      { MEDIA: {} }
    )
    expect(rejected.status).toBe(403)

    const insecure = await mediaWorker.fetch(
      new Request('https://chater-r2-test.henrymeraldcompany.workers.dev/health', {
        headers: { origin: 'http://a5652182.chater-r2-preview.pages.dev' }
      }),
      { MEDIA: {} }
    )
    expect(insecure.status).toBe(403)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports R2 health without requiring a user token', async () => {
    const response = await mediaWorker.fetch(
      new Request('https://chater-r2-test.henrymeraldcompany.workers.dev/health', {
        headers: { origin: 'https://chater-r2-preview.pages.dev' }
      }),
      { MEDIA: {} }
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      storage: 'cloudflare-r2',
      bucketConfigured: true
    })
    expect(response.headers.get('access-control-allow-origin')).toBe('https://chater-r2-preview.pages.dev')
  })

  it('continues Moment expiry cleanup through every R2 list page', async () => {
    const now = Date.now()
    const media = {
      list: vi.fn()
        .mockResolvedValueOnce({
          objects: [{
            key: 'users/member_1/moments/expired-first.png',
            uploaded: new Date(now - 25 * 60 * 60 * 1000),
            customMetadata: {}
          }],
          truncated: true,
          cursor: 'next-page'
        })
        .mockResolvedValueOnce({
          objects: [
            {
              key: 'users/member_2/moments/expired-second.mp4',
              uploaded: new Date(now - 26 * 60 * 60 * 1000),
              customMetadata: {}
            },
            {
              key: 'users/member_2/moments/still-active.mp4',
              uploaded: new Date(now - 23 * 60 * 60 * 1000),
              customMetadata: {}
            }
          ],
          truncated: false
        }),
      delete: vi.fn(async () => undefined)
    }
    let scheduledWork: Promise<unknown> | undefined
    await mediaWorker.scheduled({}, { MEDIA: media }, {
      waitUntil: (promise: Promise<unknown>) => { scheduledWork = promise }
    })
    await scheduledWork

    expect(media.list).toHaveBeenCalledTimes(2)
    expect(media.list).toHaveBeenNthCalledWith(2, {
      prefix: 'users/',
      cursor: 'next-page',
      limit: 1000,
      include: ['customMetadata']
    })
    expect(media.delete).toHaveBeenCalledTimes(2)
    expect(media.delete).toHaveBeenNthCalledWith(1, ['users/member_1/moments/expired-first.png'])
    expect(media.delete).toHaveBeenNthCalledWith(2, ['users/member_2/moments/expired-second.mp4'])
  })
})
