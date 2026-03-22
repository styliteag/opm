import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { fetchApi, postApi, putApi, patchApi, deleteApi } from './api'
import { useAuthStore } from '@/stores/auth.store'

const setupAuth = () => {
  useAuthStore.setState({ token: 'test-token', user: null, isAuthenticated: true })
}

const teardown = () => {
  vi.restoreAllMocks()
  useAuthStore.setState({ token: null, user: null, isAuthenticated: false })
}

describe('fetchApi', () => {
  beforeEach(setupAuth)
  afterEach(teardown)

  it('sends authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'test' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await fetchApi('/api/test')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer test-token')
  })

  it('does not send auth header when no token', async () => {
    useAuthStore.setState({ token: null })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
    vi.stubGlobal('fetch', mockFetch)

    await fetchApi('/api/test')
    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('throws on non-ok response with detail message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ detail: 'Invalid input' }),
    }))

    await expect(fetchApi('/api/test')).rejects.toThrow('Invalid input')
  })

  it('handles FastAPI validation errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: () => Promise.resolve({
        detail: [
          { msg: 'field required', loc: ['body', 'name'] },
          { msg: 'too short', loc: ['body', 'password'] },
        ],
      }),
    }))

    await expect(fetchApi('/api/test')).rejects.toThrow('field required; too short')
  })

  it('calls logout on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ detail: 'Session expired' }),
    }))

    await expect(fetchApi('/api/test')).rejects.toThrow('Session expired')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('falls back to statusText when json fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('not json')),
    }))

    await expect(fetchApi('/api/test')).rejects.toThrow('Internal Server Error')
  })
})

describe('postApi', () => {
  beforeEach(setupAuth)
  afterEach(teardown)

  it('sends POST with JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 1 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await postApi('/api/items', { name: 'test' })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/items')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'test' })
    expect(result).toEqual({ id: 1 })
  })
})

describe('putApi', () => {
  beforeEach(setupAuth)
  afterEach(teardown)

  it('sends PUT with JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ updated: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await putApi('/api/items/1', { name: 'updated' })
    const [, init] = mockFetch.mock.calls[0]
    expect(init.method).toBe('PUT')
  })
})

describe('patchApi', () => {
  beforeEach(setupAuth)
  afterEach(teardown)

  it('sends PATCH with JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ patched: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await patchApi('/api/items/1', { status: 'done' })
    const [, init] = mockFetch.mock.calls[0]
    expect(init.method).toBe('PATCH')
  })
})

describe('deleteApi', () => {
  beforeEach(setupAuth)
  afterEach(teardown)

  it('sends DELETE request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
    vi.stubGlobal('fetch', mockFetch)

    await deleteApi('/api/items/1')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/items/1')
    expect(init.method).toBe('DELETE')
  })
})
