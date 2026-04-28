// Copyright (c) 2026, CasaModerna and contributors
// For license information, please see license.txt

frappe.ui.form.on("CM Customer Appointment", {
	customer: function (frm) {
		if (frm.doc.customer) {
			frappe.db.get_value("Customer", frm.doc.customer, "customer_name", (r) => {
				frm.set_value("customer_name", r.customer_name);
			});
		}
	},

	refresh: function (frm) {
		frm.set_intro(
			__("Manage customer showroom appointments and consultations."),
			"blue"
		);

		// Quick calendar link
		if (!frm.is_new()) {
			frm.add_custom_button(__("View Calendar"), () => {
				frappe.set_route("List", "CM Customer Appointment", "Calendar");
			});
		}
	},
});
