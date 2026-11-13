import { describe, expect, it } from 'vitest'
import { filterActiveMoments, isMomentActive, MOMENT_LIFETIME_MS } from './moments'

describe('Chater Moment expiry', () => {
  it('sets the lifetime to exactly 24 hours', () => {
    const createdAt = 1_800_000_000_000
    expect(createdAt + MOMENT_LIFETIME_MS - createdAt).toBe(24 * 60 * 60 * 1000)
  })

  it('keeps a Moment active up to but not including its expiry time', () => {
    expect(isMomentActive(20_000, 19_999)).toBe(true)
    expect(isMomentActive(20_000, 20_000)).toBe(false)
  })

  it('filters expired and invalid expiry values out of the feed', () => {
    const moments = [
      { id: 'active', expiresAt: 30_000 },
      { id: 'expired', expiresAt: 10_000 },
      { id: 'invalid', expiresAt: Number.NaN },
    ]
    expect(filterActiveMoments(moments, 20_000).map(moment => moment.id)).toEqual(['active'])
  })
})
