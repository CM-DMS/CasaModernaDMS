import frappe


def block_quotation_delete(doc, method=None):
    """Quotations must be cancelled, not deleted."""
    frappe.throw(
        "Quotations cannot be deleted. Please cancel the quotation instead.",
        frappe.ValidationError,
        title="Delete Not Allowed",
    )
