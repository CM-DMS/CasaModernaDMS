"""deposit_allocation_api.py — whitelisted endpoints for SO-deposit → SI allocation.

ERPNext mechanism:
  - Sales Invoice.advances  (child table: Sales Invoice Advance)
  - Sales Invoice.set_advances()  — populates child table from linked Payment Entries
  - taxes_and_totals.calculate_total_advance() — sums allocated_amount → total_advance
  - taxes_and_totals.calculate_outstanding_amount() — outstanding = grand_total - total_advance

The key native path:
    si.set_advances()          ← populates si.advances in-memory from PE→SO links
    si.insert() / si.save()    ← validate() → calculate_taxes_and_totals() →
                                  total_advance → outstanding_amount
"""

import json

import frappe
from frappe import _
from frappe.utils import flt


@frappe.whitelist()
def get_allocatable_advances(si_name: str) -> dict:
    """Return available advances for a draft Sales Invoice.

    Returns:
        {
            "entries": [ { reference_type, reference_name, reference_row,
                           amount, remarks, exchange_rate, against_order, ... } ],
            "applied":  [ { reference_type, reference_name, reference_row,
                            advance_amount, allocated_amount, remarks } ],
            "outstanding_amount": float,
            "total_advance": float,
        }

    ``entries`` comes from ERPNext's si.get_advance_entries() — it returns
    PE rows linked via Payment Entry Reference → Sales Order → SI items.
    ``applied`` is whatever is currently in si.advances (already saved).
    """
    frappe.has_permission("Sales Invoice", "write", si_name, throw=True)
    si = frappe.get_doc("Sales Invoice", si_name)

    # ERPNext computes available advances (PE rows linked to SI's SOs)
    entries = si.get_advance_entries(include_unallocated=True)

    applied = [
        {
            "reference_type": a.reference_type,
            "reference_name": a.reference_name,
            "reference_row": a.reference_row,
            "advance_amount": flt(a.advance_amount),
            "allocated_amount": flt(a.allocated_amount),
            "remarks": a.remarks or "",
        }
        for a in (si.advances or [])
    ]

    return {
        "entries": list(entries),
        "applied": applied,
        "outstanding_amount": flt(si.outstanding_amount),
        "total_advance": flt(si.total_advance),
    }


@frappe.whitelist()
def set_si_advances(si_name: str, allocations_json: str) -> dict:
    """Write allocation rows to a draft SI's advances child table and save.

    allocations_json — JSON list of dicts with keys:
        reference_type, reference_name, reference_row,
        advance_amount, allocated_amount, remarks, ref_exchange_rate (optional)

    Returns: { name, outstanding_amount, total_advance }
    """
    frappe.has_permission("Sales Invoice", "write", si_name, throw=True)
    si = frappe.get_doc("Sales Invoice", si_name)

    if si.docstatus != 0:
        frappe.throw(_("Advances can only be modified on a draft Sales Invoice."))

    allocs = (
        json.loads(allocations_json)
        if isinstance(allocations_json, str)
        else allocations_json
    )

    si.set("advances", [])
    for a in allocs or []:
        amt = flt(a.get("allocated_amount", 0))
        if amt <= 0:
            continue
        si.append(
            "advances",
            {
                "doctype": "Sales Invoice Advance",
                "reference_type": a.get("reference_type") or "Payment Entry",
                "reference_name": a["reference_name"],
                "reference_row": a.get("reference_row") or "",
                "advance_amount": flt(a.get("advance_amount") or amt),
                "allocated_amount": amt,
                "remarks": a.get("remarks") or "",
                "ref_exchange_rate": flt(a.get("ref_exchange_rate") or 1),
                "difference_posting_date": si.posting_date,
            },
        )

    si.save()

    return {
        "name": si.name,
        "outstanding_amount": flt(si.outstanding_amount),
        "total_advance": flt(si.total_advance),
    }


@frappe.whitelist()
def get_unallocated_so_deposits(customer: str) -> list:
    """Return submitted Payment Entries that are linked to Sales Orders (not SIs)
    for this customer — i.e. deposits that haven't yet been reconciled against an invoice.

    Returns list of:
        { pe_name, posting_date, paid_amount, mode_of_payment, pe_ref_row,
          against_order, available_amount }
    """
    frappe.has_permission("Payment Entry", "read", throw=True)

    pe = frappe.qb.DocType("Payment Entry")
    per = frappe.qb.DocType("Payment Entry Reference")

    rows = (
        frappe.qb.from_(pe)
        .join(per).on(per.parent == pe.name)
        .select(
            pe.name.as_("pe_name"),
            pe.posting_date,
            pe.paid_amount,
            pe.mode_of_payment,
            per.name.as_("pe_ref_row"),
            per.reference_name.as_("against_order"),
            per.allocated_amount.as_("available_amount"),
        )
        .where(pe.party_type == "Customer")
        .where(pe.party == customer)
        .where(pe.docstatus == 1)
        .where(pe.payment_type == "Receive")
        .where(per.reference_doctype == "Sales Order")
        .orderby(pe.posting_date)
    ).run(as_dict=True)

    return list(rows)


@frappe.whitelist()
def reconcile_deposit_to_si(
    pe_name: str,
    pe_ref_row: str,
    si_name: str,
    allocated_amount: float,
) -> dict:
    """Reconcile a deposit Payment Entry (linked to SO) against a submitted SI.

    Uses ERPNext's reconcile_against_document which:
      - Reduces the existing SO-linked PE Reference row's allocated_amount
      - Adds a new PE Reference row pointing to the SI
      - Updates the SI's outstanding_amount

    Returns: { si_name, outstanding_amount, status }
    """
    frappe.has_permission("Payment Entry", "write", pe_name, throw=True)
    frappe.has_permission("Sales Invoice", "write", si_name, throw=True)

    from erpnext.accounts.utils import reconcile_against_document

    allocated_amount = flt(allocated_amount)
    if allocated_amount <= 0:
        frappe.throw(_("Allocated amount must be greater than zero."))

    # Fetch SI to get account and party details
    si = frappe.get_doc("Sales Invoice", si_name)
    if si.docstatus != 1:
        frappe.throw(_("Can only reconcile against a submitted Sales Invoice."))

    pe = frappe.get_doc("Payment Entry", pe_name)
    if pe.docstatus != 1:
        frappe.throw(_("Payment Entry must be submitted."))
    if pe.party != si.customer:
        frappe.throw(_("Payment Entry customer does not match Invoice customer."))

    # Validate ref row belongs to this PE
    ref_rows = [r for r in pe.references if r.name == pe_ref_row]
    if not ref_rows:
        frappe.throw(_("Payment Entry Reference row not found."), frappe.DoesNotExistError)
    ref_row = ref_rows[0]
    if flt(allocated_amount) > flt(ref_row.allocated_amount):
        frappe.throw(
            _("Allocated amount {0} exceeds available {1}.").format(
                allocated_amount, ref_row.allocated_amount
            )
        )

    reconcile_against_document([
        frappe._dict({
            "voucher_type": "Payment Entry",
            "voucher_no": pe_name,
            "voucher_detail_no": pe_ref_row,
            "against_voucher_type": "Sales Invoice",
            "against_voucher": si_name,
            "account": si.debit_to,
            "exchange_rate": 1.0,
            "party_type": "Customer",
            "party": si.customer,
            "is_advance": "Yes",
            "dr_or_cr": "credit_in_account_currency",
            "unreconciled_amount": flt(ref_row.allocated_amount),
            "unadjusted_amount": flt(ref_row.allocated_amount),
            "allocated_amount": allocated_amount,
            "difference_amount": 0,
            "difference_account": None,
            "difference_posting_date": si.posting_date,
            "cost_center": None,
        })
    ])

    # Reload SI to get updated outstanding_amount
    si.reload()
    return {
        "si_name": si_name,
        "outstanding_amount": flt(si.outstanding_amount),
        "status": si.status,
    }


def auto_allocate_advances(si) -> None:
    """Populate si.advances from linked Payment Entries, before si.insert().

    Called by create_in_from_so / create_in_from_dn after CM fields are copied.
    Uses ERPNext's own set_advances() which queries PE → SO Reference rows,
    then auto-allocates up to grand_total.

    Requires: si.customer, si.company, si.debit_to (set by set_missing_values),
              and si.items[*].sales_order (carried from the DN/SO conversion).
    """
    try:
        si.set_advances()
        if si.advances:
            frappe.logger(__name__).info(
                "auto_allocate_advances: %d advance(s) attached for customer %s",
                len(si.advances),
                getattr(si, "customer", "?"),
            )
    except Exception:
        frappe.log_error(frappe.get_traceback(), "auto_allocate_advances failed")
