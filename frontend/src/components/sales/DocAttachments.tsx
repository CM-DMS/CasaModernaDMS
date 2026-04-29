/**
 * DocAttachments — reusable file attachment panel for any Frappe document.
 * Ported from V2 DocAttachments.jsx.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { frappe } from '../../api/frappe'

interface AttachedFile {
  name: string
  file_name: string
  file_url: string
  file_size?: number
  creation?: string
  owner?: string
  is_private?: 0 | 1
}

interface UploadEntry {
  id: string
  name: string
  error: string | null
}

function fmtSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso?: string) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`
  } catch { return iso.slice(0, 10) }
}

function fileIcon(filename?: string) {
  const ext = (filename || '').split('.').pop()?.toLowerCase() ?? ''
  const icons: Record<string, string> = {
    pdf: '📄', jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼',
    svg: '🖼', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    csv: '📊', zip: '🗜', rar: '🗜', txt: '📃',
  }
  return icons[ext] || '📎'
}

function fileUrl(url?: string) {
  if (!url) return '#'
  if (url.startsWith('/')) return window.location.origin + url
  return url
}

interface DocAttachmentsProps {
  doctype: string
  docname: string | null | undefined
  readOnly?: boolean
}

export function DocAttachments({ doctype, docname, readOnly = false }: DocAttachmentsProps) {
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploads, setUploads] = useState<UploadEntry[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [fetchErr, setFetchErr] = useState<string | null>(null)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(() => {
    if (!docname) return
    setLoading(true)
    setFetchErr(null)
    frappe.getList<AttachedFile>('File', {
      fields: ['name', 'file_name', 'file_url', 'file_size', 'creation', 'owner', 'is_private'],
      filters: [
        ['attached_to_doctype', '=', doctype],
        ['attached_to_name', '=', docname],
      ],
      order_by: 'creation desc',
      limit: 200,
    })
      .then(setFiles)
      .catch((e: any) => setFetchErr(e.message || 'Failed to load attachments'))
      .finally(() => setLoading(false))
  }, [doctype, docname])

  useEffect(() => { reload() }, [reload])

  async function uploadOne(file: File) {
    const id = `${Date.now()}-${file.name}`
    setUploads((u) => [...u, { id, name: file.name, error: null }])
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('is_private', '1')
      fd.append('doctype', doctype)
      if (docname) fd.append('docname', docname)
      const resp = await fetch('/api/method/upload_file', {
        method: 'POST',
        headers: { 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' },
        body: fd,
      })
      if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`)
      setUploads((u) => u.filter((x) => x.id !== id))
      reload()
    } catch (e: any) {
      const msg = e.message || 'Upload failed'
      setUploads((u) => u.map((x) => x.id === id ? { ...x, error: msg } : x))
    }
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return
    Array.from(fileList).forEach(uploadOne)
  }

  async function handleDelete(file: AttachedFile) {
    if (!confirm(`Delete "${file.file_name}"? This cannot be undone.`)) return
    setDeleteErr(null)
    try {
      await frappe.deleteDoc('File', file.name)
      setFiles((f) => f.filter((x) => x.name !== file.name))
    } catch (e: any) {
      setDeleteErr(e.message || 'Delete failed')
    }
  }

  if (!docname) {
    return <p className="text-xs text-gray-400 italic">Save the document first to attach files.</p>
  }

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!readOnly) handleFiles(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 cursor-pointer transition-colors select-none text-center ${
            dragOver ? 'border-cm-green bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
          }`}
        >
          <span className="text-xl">📎</span>
          <p className="text-xs font-medium text-gray-600">
            Drop files here or <span className="text-cm-green underline">click to browse</span>
          </p>
          <p className="text-[10px] text-gray-400">PDFs, images, spreadsheets — multiple files supported</p>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>
      )}

      {deleteErr && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{deleteErr}</div>}

      {uploads.length > 0 && (
        <ul className="space-y-1.5">
          {uploads.map((u) => (
            <li key={u.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs">
              <span className="shrink-0">⏳</span>
              <span className="flex-1 truncate text-gray-700">{u.name}</span>
              {u.error
                ? <span className="text-red-500 shrink-0">{u.error}</span>
                : <span className="text-cm-green shrink-0 animate-pulse">Uploading…</span>
              }
              {u.error && (
                <button type="button" className="text-gray-400 hover:text-gray-600 shrink-0"
                  onClick={() => setUploads((up) => up.filter((x) => x.id !== u.id))}>✕</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {fetchErr && <p className="text-xs text-red-600">{fetchErr}</p>}
      {loading && files.length === 0 && <p className="text-xs text-gray-400 animate-pulse">Loading attachments…</p>}
      {!loading && files.length === 0 && uploads.length === 0 && (
        <p className="text-xs text-gray-400 italic">No attachments yet.</p>
      )}

      {files.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-3 bg-white px-3 py-2.5 hover:bg-gray-50 transition-colors">
              <span className="text-lg shrink-0">{fileIcon(f.file_name)}</span>
              <div className="flex-1 min-w-0">
                <a href={fileUrl(f.file_url)} target="_blank" rel="noreferrer"
                  className="block text-xs font-medium text-cm-green hover:underline truncate" title={f.file_name}>
                  {f.file_name}
                </a>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                  {fmtSize(f.file_size) && <span>{fmtSize(f.file_size)}</span>}
                  <span>·</span>
                  <span>{fmtDate(f.creation)}</span>
                  <span>·</span>
                  <span>{f.owner}</span>
                  {!!f.is_private && <span title="Private — login required">🔒</span>}
                </div>
              </div>
              {!readOnly && (
                <button type="button" onClick={() => handleDelete(f)}
                  className="text-red-300 hover:text-red-600 transition-colors p-1 shrink-0" title="Delete attachment">
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
