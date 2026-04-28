/**
 * frappe.ts — Frappe REST API v2 client.
 *
 * All backend calls go through here. Session is cookie-based (no JWT).
 * Targets /api/v2/ — available on Frappe 15+.
 *
 * Success shape:  { data: <result> }
 * Error shape:    { errors: [{ type: string, message: string }] }
 */

// ─── Error handling ──────────────────────────────────────────────────────────

function classifyError(status: number, json: Record<string, unknown>): string {
  if (status === 401) return 'AUTH_REQUIRED'
  if (status === 403) {
    const detail = [
      (json?.errors as Array<{ message?: string }>)?.[0]?.message,
      json?.message,
      json?.exception,
    ]
      .filter(Boolean)
      .join(' ')
    if (/login|csrf|session expired|Guest/i.test(detail)) return 'AUTH_REQUIRED'
    return 'PERMISSION_DENIED'
  }
  if (status === 404) return 'DOC_NOT_FOUND'
  if (status === 409) return 'DOC_AMENDED'
  if (status === 417) return 'VALIDATION_ERROR'
  if (status === 429) return 'RATE_LIMITED'
  const errType = (json?.errors as Array<{ type?: string }>)?.[0]?.type
  if (errType === 'ValidationError') return 'VALIDATION_ERROR'
  if (errType === 'DuplicateEntryError') return 'DUPLICATE_ENTRY'
  return 'SERVER_ERROR'
}

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Your session has expired. Please log in again.',
  PERMISSION_DENIED: 'You do not have permission to perform this action.',
  DOC_NOT_FOUND: 'The requested record was not found.',
  DOC_AMENDED: 'This document has been amended and cannot be modified.',
  VALIDATION_ERROR: 'Please check the form for errors.',
  DUPLICATE_ENTRY: 'A record with that name already exists.',
  RATE_LIMITED: 'Too many requests. Please try again shortly.',
  SERVER_ERROR: 'An unexpected server error occurred.',
}

export class ApiError extends Error {
  code: string
  userMessage: string
  serverMessage: string | undefined
  httpStatus: number

  constructor(code: string, serverMessage: string | undefined, httpStatus: number) {
    const msg = ERROR_MESSAGES[code] ?? ERROR_MESSAGES['SERVER_ERROR']
    super(msg)
    this.code = code
    this.userMessage = msg
    this.serverMessage = serverMessage
    this.httpStatus = httpStatus
  }
}

// ─── CSRF ─────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    csrf_token?: string
  }
}

function getCsrfToken(): string {
  if (window.csrf_token && window.csrf_token !== 'fetch') return window.csrf_token
  const match = document.cookie.split('; ').find((c) => c.startsWith('X-Frappe-CSRF-Token='))
  return match ? match.split('=')[1] : 'fetch'
}

async function refreshCsrfToken(): Promise<void> {
  try {
    const res = await fetch('/api/v2/method/casamoderna_dms.session_api.get_my_roles', {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    if (res.ok) {
      const json = (await res.json()) as { data?: { csrf_token?: string } }
      if (json?.data?.csrf_token) window.csrf_token = json.data.csrf_token
    }
  } catch {
    // best-effort
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=')[1]) : null
}

function getLoginPath(): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  return `${base || ''}/login`
}

// ─── Core fetch ──────────────────────────────────────────────────────────────

const UNSAFE = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  isRetry = false,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Frappe-CSRF-Token': getCsrfToken(),
  }

  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // Stale CSRF token → refresh and retry once
  if (res.status === 400 && UNSAFE.has(method) && !isRetry) {
    await refreshCsrfToken()
    return request<T>(method, path, body, true)
  }

  let json: Record<string, unknown>
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    throw new Error(`Server returned non-JSON response (${res.status})`)
  }

  if (res.status === 403) {
    const currentUser = getCookie('user_id')
    const detail = [
      (json?.errors as Array<{ message?: string }>)?.[0]?.message,
      json?.message,
      json?.exception,
    ]
      .filter(Boolean)
      .join(' ')
    const sessionExpired =
      !currentUser ||
      currentUser === 'Guest' ||
      /login to access|csrf|session expired/i.test(detail)

    if (sessionExpired) {
      window.dispatchEvent(new CustomEvent('frappe:session-expired'))
      window.location.href = getLoginPath()
    }

    // Some Frappe versions return 403 for stale CSRF
    if (/csrf/i.test(detail) && UNSAFE.has(method) && !isRetry) {
      await refreshCsrfToken()
      return request<T>(method, path, body, true)
    }

    const code = classifyError(403, json)
    throw new ApiError(
      code,
      (json?.errors as Array<{ message?: string }>)?.[0]?.message ??
        (json?.message as string | undefined),
      403,
    )
  }

  // 2FA challenge (login step 1)
  if (
    (json as { verification?: unknown; tmp_id?: unknown }).verification &&
    (json as { tmp_id?: unknown }).tmp_id
  ) {
    return json as T
  }

  if (!res.ok || (json.errors as unknown[])?.length) {
    const code = classifyError(res.status, json)
    const msg =
      (json.errors as Array<{ message?: string }>)?.[0]?.message ??
      (json.message as string | undefined) ??
      `HTTP ${res.status}`
    throw new ApiError(code, msg, res.status)
  }

  return (json.data !== undefined ? json.data : json) as T
}

// ─── List helper types ────────────────────────────────────────────────────────

export interface ListOptions {
  fields?: string[]
  filters?: Array<[string, string, string, unknown]> | Record<string, unknown>
  limit?: number
  order_by?: string
  limit_start?: number
}

// ─── Public API object ────────────────────────────────────────────────────────

export const frappe = {
  /** Call a whitelisted Python method via POST */
  call<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
    return request<T>('POST', `/api/v2/method/${method}`, args)
  },

  /** Call a whitelisted Python method via GET (no CSRF needed) */
  callGet<T = unknown>(method: string, args?: Record<string, string>): Promise<T> {
    const params = new URLSearchParams(args)
    return request<T>('GET', `/api/v2/method/${method}?${params}`)
  },

  /** Fetch a single document */
  getDoc<T = unknown>(doctype: string, name: string): Promise<T> {
    return request<T>(
      'GET',
      `/api/v2/document/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/`,
    )
  },

  /** Fetch a list of documents */
  async getList<T = unknown>(doctype: string, opts: ListOptions = {}): Promise<T[]> {
    const params = new URLSearchParams()
    if (opts.fields) params.set('fields', JSON.stringify(opts.fields))
    if (opts.filters) params.set('filters', JSON.stringify(opts.filters))
    if (opts.limit) params.set('limit', String(opts.limit))
    if (opts.order_by) params.set('order_by', opts.order_by)
    if (opts.limit_start) params.set('start', String(opts.limit_start))
    const res = await request<T[] | { data: T[] }>(
      'GET',
      `/api/v2/document/${encodeURIComponent(doctype)}?${params}`,
    )
    return Array.isArray(res) ? res : ((res as { data: T[] }).data ?? [])
  },

  /** Create or update a document */
  saveDoc<T = unknown>(doctype: string, doc: Record<string, unknown>): Promise<T> {
    return doc.name
      ? request<T>(
          'PUT',
          `/api/v2/document/${encodeURIComponent(doctype)}/${encodeURIComponent(doc.name as string)}/`,
          doc,
        )
      : request<T>('POST', `/api/v2/document/${encodeURIComponent(doctype)}`, doc)
  },

  /** Delete a document */
  deleteDoc(doctype: string, name: string): Promise<void> {
    return request<void>(
      'DELETE',
      `/api/v2/document/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/`,
    )
  },

  get<T = unknown>(path: string): Promise<T> {
    return request<T>('GET', path)
  },

  post<T = unknown>(path: string, data?: unknown): Promise<T> {
    return request<T>('POST', path, data)
  },
}
