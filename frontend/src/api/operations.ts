/**
 * operations.ts — API helpers for the Operations module.
 * Appointments, Leave Requests, Deliveries, SMS.
 */
import { frappe } from './frappe'

const M = 'casamoderna_dms.ops_calendar'

// ─── Calendar events ─────────────────────────────────────────────────────────

export const getAppointmentEvents = <T = unknown>(start: string, end: string) =>
  frappe.callGet<T[]>(
    'casamoderna_dms.casamoderna_dms.doctype.cm_customer_appointment.cm_customer_appointment.get_events',
    { start, end },
  )

export const getDeliveryEvents = <T = unknown>(start: string, end: string) =>
  frappe.callGet<T[]>(`${M}.get_delivery_events`, { start, end })

export const getLeaveEvents = <T = unknown>(start: string, end: string) =>
  frappe.callGet<T[]>(`${M}.get_cm_leave_events`, { start, end })

// ─── Appointment CRUD ────────────────────────────────────────────────────────

export interface AppointmentDoc {
  name?: string
  customer?: string
  customer_name?: string
  appointment_type?: string
  status?: string
  appointment_date?: string
  start_time?: string
  end_time?: string
  location?: string
  salesperson?: string
  notes?: string
}

export interface UserRow { name: string; full_name?: string }

export const appointmentsApi = {
  list(args: { status?: string; mine?: boolean; limit?: number } = {}) {
    const params: Record<string, unknown> = { limit: args.limit ?? 50 }
    if (args.status) params.status = args.status
    if (args.mine)   params.mine   = 1
    return frappe.callGet<AppointmentDoc[]>(`${M}.get_appointment_list`, params)
  },
  get(name: string) {
    return frappe.getDoc<AppointmentDoc>('CM Customer Appointment', name)
  },
  save(doc: AppointmentDoc) {
    return frappe.call<AppointmentDoc>(`${M}.save_appointment`, { doc: JSON.stringify(doc) })
  },
  delete(name: string) {
    return frappe.call<void>(`${M}.delete_appointment`, { name })
  },
  delegate(name: string, toUser: string) {
    return frappe.call<AppointmentDoc>(`${M}.delegate_appointment`, { name, to_user: toUser })
  },
  getUsers() {
    return frappe.callGet<UserRow[]>(`${M}.get_users_for_delegation`)
  },
}

// ─── Leave Request CRUD ──────────────────────────────────────────────────────

export interface LeaveRequestDoc {
  name?: string
  employee_user?: string
  employee_name?: string
  leave_type?: string
  from_date?: string
  to_date?: string
  total_days?: number
  status?: string
  reason?: string
  reviewer_notes?: string
  reviewed_by?: string
}

export const leaveRequestsApi = {
  list(args: { status?: string; mine?: boolean; limit?: number } = {}) {
    const params: Record<string, unknown> = { limit: args.limit ?? 50 }
    if (args.status) params.status = args.status
    if (args.mine)   params.mine   = 1
    return frappe.callGet<LeaveRequestDoc[]>(`${M}.get_leave_request_list`, params)
  },
  get(name: string) {
    return frappe.getDoc<LeaveRequestDoc>('CM Leave Request', name)
  },
  save(doc: LeaveRequestDoc) {
    return frappe.call<LeaveRequestDoc>(`${M}.save_leave_request`, { doc: JSON.stringify(doc) })
  },
  review(name: string, status: string, notes = '') {
    return frappe.call<LeaveRequestDoc>(`${M}.review_leave_request`, { name, status, notes })
  },
  delete(name: string) {
    return frappe.call<void>(`${M}.delete_leave_request`, { name })
  },
}

// ─── Delivery scheduling ─────────────────────────────────────────────────────

export interface DeliveryNoteRow { name: string; customer_name?: string }
export interface EmployeeRow { name: string; employee_name?: string }

export const deliverySchedulingApi = {
  searchUnscheduled(search = '') {
    return frappe.callGet<DeliveryNoteRow[]>(`${M}.search_unscheduled_deliveries`, { search })
  },
  getEmployees() {
    return frappe.callGet<EmployeeRow[]>(`${M}.get_delivery_employees`)
  },
  schedule(args: {
    dn_name: string
    delivery_date: string
    time_slot?: string
    team?: string
    instructions?: string
  }) {
    return frappe.call<void>(`${M}.schedule_delivery`, {
      dn_name:      args.dn_name,
      delivery_date: args.delivery_date,
      time_slot:    args.time_slot    ?? '',
      team:         args.team         ?? '',
      instructions: args.instructions ?? '',
    })
  },
}

// ─── SMS ─────────────────────────────────────────────────────────────────────

export interface SmsLogRow {
  name: string
  sent_at?: string
  sms_type?: string
  status?: string
  customer?: string
  customer_name?: string
  recipient?: string
  reference_name?: string
  message?: string
  error_message?: string
}

export interface AppointmentNotificationResult {
  ok: boolean
  sms_sent: boolean
  sms_error: string
  email_sent: boolean
  email_error: string
}

export const smsApi = {
  resendDelivery(name: string) {
    return frappe.call<void>('casamoderna_dms.sms_api.resend_delivery_appointment_sms', { name })
  },
  resendConsultation(name: string) {
    return frappe.call<void>('casamoderna_dms.sms_api.resend_consultation_appointment_sms', { name })
  },
  sendAppointmentNotification(name: string) {
    return frappe.call<AppointmentNotificationResult>('casamoderna_dms.sms_api.send_appointment_notification', { name })
  },
  getLog(args: {
    sms_type?: string
    status?: string
    customer?: string
    from_date?: string
    to_date?: string
    limit?: number
  } = {}) {
    const params: Record<string, unknown> = { limit: args.limit ?? 200 }
    if (args.sms_type)  params.sms_type  = args.sms_type
    if (args.status)    params.status    = args.status
    if (args.customer)  params.customer  = args.customer
    if (args.from_date) params.from_date = args.from_date
    if (args.to_date)   params.to_date   = args.to_date
    return frappe.callGet<SmsLogRow[]>('casamoderna_dms.sms_api.get_sms_log', params)
  },
}
