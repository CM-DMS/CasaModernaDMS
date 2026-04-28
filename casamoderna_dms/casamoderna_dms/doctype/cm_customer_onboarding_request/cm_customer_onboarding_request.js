// Client script for CM Customer Onboarding Request
// Adds a "Create Customer" action button when status is not yet Converted.

frappe.ui.form.on("CM Customer Onboarding Request", {
	refresh(frm) {
		if (frm.doc.status !== "Converted" && !frm.doc.__islocal) {
			frm.add_custom_button(__("Create Customer"), () => {
				frappe.confirm(
					`Create a new Customer record from <strong>${frm.doc.full_name}</strong>?`,
					() => {
						frappe.call({
							method: "casamoderna_dms.onboarding_api.create_customer_from_request",
							args: { request_name: frm.doc.name },
							freeze: true,
							freeze_message: "Creating customer…",
							callback(r) {
								if (!r.message) return;

								if (r.message.conflict) {
									// A customer with the same name already exists — offer to merge.
									const { customer, customer_name } = r.message.conflict;
									frappe.confirm(
										`A customer named <strong>${customer_name}</strong> (${customer}) already exists.<br><br>`
										+ `Update their contact and address details with the data from this registration?`,
										() => {
											frappe.call({
												method: "casamoderna_dms.onboarding_api.merge_request_into_customer",
												args: { request_name: frm.doc.name, customer_name: customer },
												freeze: true,
												freeze_message: "Updating customer…",
												callback(r2) {
													if (r2.message) {
														frappe.show_alert({
															message: `Customer <strong>${r2.message}</strong> updated.`,
															indicator: "green",
														}, 5);
														frm.reload_doc();
													}
												},
											});
										}
									);
								} else if (r.message.created) {
									frappe.show_alert({
										message: `Customer <strong>${r.message.created}</strong> created.`,
										indicator: "green",
									}, 5);
									frm.reload_doc();
								}
							},
						});
					}
				);
			}, __("Actions"));
		}

		if (frm.doc.created_customer) {
			frm.add_custom_button(__("Open Customer"), () => {
				frappe.set_route("Form", "Customer", frm.doc.created_customer);
			}, __("Actions"));
		}
	},
});
