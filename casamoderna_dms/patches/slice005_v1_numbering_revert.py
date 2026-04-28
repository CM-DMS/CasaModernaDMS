import frappe


def execute():
	# Slice 005: ensure V1-visible numbering fields + print formats exist.
	from casamoderna_dms.v1_numbering import ensure_v1_numbering_setup

	frappe.set_user("Administrator")
	ensure_v1_numbering_setup(commit=True)
