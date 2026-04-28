import frappe


def execute():
	"""Remove legacy global Property Setters that hid noise fields for everyone.

	Per V1 evidence + requirements, these fields must be hidden for Sales via role-gated
	Client Script (not global Property Setters).
	"""
	fieldnames = [
		"territory",
		"lead_name",
		"opportunity_name",
		"prospect_name",
		"account_manager",
		"default_currency",
		"default_bank_account",
		"default_price_list",
	]

	for fieldname in fieldnames:
		name = f"Customer-{fieldname}-hidden"
		if frappe.db.exists("Property Setter", name):
			frappe.delete_doc("Property Setter", name, ignore_permissions=True, force=True)
