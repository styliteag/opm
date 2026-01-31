import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getAuthHeaders, extractErrorMessage, fetchJson } from './api'

describe('getAuthHeaders', () => {
  it('should return correct authorization header', () => {
    const token = 'test-token-123'
    const headers = getAuthHeaders(token)

    expect(headers).toEqual({
      Authorization: 'Bearer test-token-123',
    })
  })

  it('should handle empty token', () => {
    const headers = getAuthHeaders('')

    expect(headers).toEqual({
      Authorization: 'Bearer ',
    })
  })
})

describe('extractErrorMessage', () => {
  it('should extract string detail from response', async () => {
    const response = new Response(JSON.stringify({ detail: 'User not found' }), {
      status: 404,
      statusText: 'Not Found',
    })

    const message = await extractErrorMessage(response)

    expect(message).toBe('User not found')
  })

  it('should extract validation errors from FastAPI 422 response', async () => {
    const response = new Response(
      JSON.stringify({
        detail: [
          { loc: ['body', 'email'], msg: 'invalid email format', type: 'value_error' },
          { loc: ['body', 'password'], msg: 'too short', type: 'value_error' },
        ],
      }),
      { status: 422, statusText: 'Unprocessable Entity' }
    )

    const message = await extractErrorMessage(response)

    expect(message).toContain('email: invalid email format')
    expect(message).toContain('password: too short')
  })

  it('should fall back to status text when JSON parsing fails', async () => {
    const response = new Response('Not JSON', {
      status: 500,
      statusText: 'Internal Server Error',
    })

    const message = await extractErrorMessage(response)

    expect(message).toBe('Internal Server Error')
  })

  it('should return "Request failed" when no status text', async () => {
    const response = new Response('Not JSON', {
      status: 500,
      statusText: '',
    })

    const message = await extractErrorMessage(response)

    expect(message).toBe('Request failed')
  })

  it('should handle validation error without msg field', async () => {
    const response = new Response(
      JSON.stringify({
        detail: [{ loc: ['body', 'field'], type: 'missing' }],
      }),
      { status: 422 }
    )

    const message = await extractErrorMessage(response)

    expect(message).toContain('field: missing')
  })
})

describe('fetchJson', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should fetch and return JSON data on success', async () => {
    const mockData = { id: 1, name: 'Test' }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchJson('/api/test', 'token123')

    expect(result).toEqual(mockData)
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/test', {
      headers: { Authorization: 'Bearer token123' },
    })
  })

  it('should throw error with message on failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ detail: 'Invalid credentials' }),
    })

    await expect(fetchJson('/api/test', 'bad-token')).rejects.toThrow('Invalid credentials')
  })

  it('should use status text when JSON error extraction fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('Invalid JSON')),
    })

    await expect(fetchJson('/api/test', 'token')).rejects.toThrow('Internal Server Error')
  })
})
