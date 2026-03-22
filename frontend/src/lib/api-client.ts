import createClient from 'openapi-fetch'

import { useAuthStore } from '@/stores/auth.store'

// Until we generate types from the OpenAPI schema, use a basic client
// After running `npm run generate:api`, import paths from './api-types'
// and use: createClient<paths>({ baseUrl: '' })
const client = createClient({ baseUrl: '' })

// Add auth middleware that reads token from Zustand store
client.use({
  async onRequest({ request }) {
    const token = useAuthStore.getState().token
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
  async onResponse({ response }) {
    if (response.status === 401) {
      useAuthStore.getState().logout()
    }
    return response
  },
})

export { client }

export async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((e: { msg?: string; loc?: string[] }) =>
          e.loc ? `${e.loc.join('.')}: ${e.msg}` : e.msg,
        )
        .join('; ')
    }
    return response.statusText
  } catch {
    return response.statusText
  }
}
