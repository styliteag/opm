import { describe, it, expect } from 'vitest'

import { loginSchema } from './auth.schemas'

describe('loginSchema', () => {
  it('validates a correct login', () => {
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
      password: 'secret123',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty email', () => {
    const result = loginSchema.safeParse({
      email: '',
      password: 'secret123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid email format', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'secret123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
      password: '',
    })
    expect(result.success).toBe(false)
  })
})
