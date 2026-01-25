export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export const getAuthHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
})

export const extractErrorMessage = async (response: Response) => {
  try {
    const data = await response.json()
    // Handle FastAPI validation errors (422)
    if (Array.isArray(data?.detail)) {
      const errors = data.detail.map((err: { msg?: string; loc?: unknown[]; type?: string }) => {
        const field = Array.isArray(err.loc) ? err.loc.slice(1).join('.') : 'field'
        return `${field}: ${err.msg || err.type || 'validation error'}`
      })
      return errors.join(', ')
    }
    if (typeof data?.detail === 'string') {
      return data.detail
    }
  } catch {
    // Ignore JSON parsing errors and fall back to status text.
  }
  return response.statusText || 'Request failed'
}

export const fetchJson = async <T>(path: string, token: string): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...getAuthHeaders(token),
    },
  })

  if (!response.ok) {
    const message = await extractErrorMessage(response)
    throw new Error(message)
  }

  return response.json()
}
