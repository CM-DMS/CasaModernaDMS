/**
 * ChangePassword — update login password.
 * Route: /auth/change-password
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, FieldWrap } from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { frappe } from '../../api/frappe'

export function ChangePassword() {
  const navigate = useNavigate()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const validate = (): string | null => {
    if (!currentPassword)          return 'Current password is required.'
    if (newPassword.length < 8)    return 'New password must be at least 8 characters.'
    if (newPassword !== confirmPassword) return 'New passwords do not match.'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationError = validate()
    if (validationError) { setError(validationError); return }
    setSaving(true)
    setError(null)
    try {
      await frappe.call('frappe.core.doctype.user.user.update_password', {
        old_password: currentPassword,
        new_password: newPassword,
      })
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError((err as Error).message || 'Password change failed. Check your current password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <PageHeader
        title="Change Password"
        subtitle="Update your login password"
        actions={
          <button className={CM.btn.secondary} onClick={() => navigate(-1)}>← Back</button>
        }
      />

      {success ? (
        <div className="mx-6 rounded-lg bg-green-50 border border-green-200 px-5 py-4 text-sm text-green-800">
          Password updated successfully.{' '}
          <button
            className="underline font-medium hover:text-green-900"
            onClick={() => setSuccess(false)}
          >
            Change again?
          </button>
        </div>
      ) : (
        <div className="mx-6 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Password</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FieldWrap label="Current Password">
              <input
                type="password"
                className={CM.input}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </FieldWrap>

            <FieldWrap label="New Password">
              <input
                type="password"
                className={CM.input}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                required
              />
            </FieldWrap>

            <FieldWrap label="Confirm New Password">
              <input
                type="password"
                className={CM.input}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </FieldWrap>

            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="flex gap-2 pt-1">
              <button type="submit" className={CM.btn.primary} disabled={saving}>
                {saving ? 'Saving…' : 'Update Password'}
              </button>
              <button type="button" className={CM.btn.secondary} onClick={() => navigate(-1)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
