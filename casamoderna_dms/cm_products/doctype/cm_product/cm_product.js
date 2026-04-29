// CM Product — form script
// Handles the "Simplified View" toggle (cm_show_inc_vat).
// When the checkbox is ON (=1), ex-VAT breakdown fields are hidden via depends_on
// in the DocType JSON.  This script re-triggers the conditional display on toggle
// change so the user sees the result immediately without a full page reload.

frappe.ui.form.on("CM Product", {
	refresh(frm) {
		_apply_vat_toggle(frm);

		// Inform the user that cm_given_code is auto-assigned on first save.
		if (frm.is_new()) {
			frm.set_intro(
				__("Product code will be auto-generated on Save based on Product Group and Supplier Code."),
				"blue"
			);
		}
	},

	cm_show_inc_vat(frm) {
		_apply_vat_toggle(frm);
	},

	// Clear the manual-override flag when the user explicitly zeroes the RRP,
	// so the next save can auto-compute it again from cost + margin.
	cm_rrp_ex_vat(frm) {
		if (!frm.doc.cm_rrp_ex_vat) {
			frm.set_value("cm_rrp_manual_override", 0);
		}
	},
});

function _apply_vat_toggle(frm) {
	// The depends_on expressions in the JSON already hide/show fields on load.
	// Calling refresh_field forces re-evaluation after a user interaction.
	const ex_vat_fields = [
		"cm_offer_tier1_ex_vat", "cm_offer_tier1_discount_pct",
		"cm_offer_tier2_ex_vat", "cm_offer_tier2_discount_pct",
		"cm_offer_tier3_ex_vat", "cm_offer_tier3_discount_pct",
	];
	ex_vat_fields.forEach(f => frm.refresh_field(f));
}
