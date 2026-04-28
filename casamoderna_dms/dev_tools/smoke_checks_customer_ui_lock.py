import frappe


NOISE_FIELDS = [
	"territory",
	"lead_name",
	"opportunity_name",
	"prospect_name",
	"account_manager",
	"default_currency",
	"default_bank_account",
	"default_price_list",
	"internal_customer_section",
	"more_info",
	"cm_contact_compliance_section",
]

PRIVILEGED_ROLES = [
	"System Manager",
	"Accounts Manager",
	"Accounts User",
]


def run(site: str | None = None):
	if site:
		frappe.init(site=site)
		frappe.connect()

	try:
		installed = set(frappe.get_installed_apps() or [])
		assert "casamoderna_dms" in installed, "casamoderna_dms is not installed on this site"

		cs_name = "Customer - CasaModerna Minimal View"
		assert frappe.db.exists("Client Script", cs_name), f"Missing Client Script: {cs_name}"
		cs = frappe.get_doc("Client Script", cs_name)

		assert cs.dt == "Customer", f"Expected dt='Customer' but got {cs.dt!r}"
		enabled_val = int(getattr(cs, "enabled", 0) or 0)
		is_enabled_val = int(getattr(cs, "is_enabled", 0) or 0)
		is_enabled_ok = bool(enabled_val == 1 or is_enabled_val == 1)

		script = cs.script or ""
		noise_ok = all(f in script for f in NOISE_FIELDS)
		privileged_ok = all(r in script for r in PRIVILEGED_ROLES)
		fallback_ok = "CM_UI_LOCK_FALLBACK_GATE" in script
		bypass_ok = "CM_UI_LOCK_PRIVILEGED_BYPASS" in script
		apply_all_ok = "CM_UI_LOCK_APPLY_ALL" in script

		assert is_enabled_ok, "Client Script is not enabled (enabled/is_enabled not truthy)"
		assert noise_ok, "Client Script does not contain the full NOISE_FIELDS list"
		assert fallback_ok, "Client Script missing fallback-gate marker"
		assert apply_all_ok, "Client Script missing apply-all marker"

		print(f"Site: {frappe.local.site}")
		print("Client Script enabled: YES" if is_enabled_ok else "Client Script enabled: NO")
		print("Noise fields covered: ALL" if noise_ok else "Noise fields covered: MISSING")
		print("Apply-to-all present: YES" if apply_all_ok else "Apply-to-all present: NO")
		print("Fallback gate present: YES" if fallback_ok else "Fallback gate present: NO")
		print("SMOKE OK — CUSTOMER UI LOCK")
	finally:
		if site:
			frappe.destroy()
