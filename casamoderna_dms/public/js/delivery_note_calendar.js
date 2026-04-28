// Copyright (c) 2026, CasaModerna and contributors
// Calendar view for Delivery Note – shows scheduled deliveries by cm_delivery_date

frappe.views.calendar["Delivery Note"] = {
	field_map: {
		start: "cm_delivery_date",
		end: "cm_delivery_date",
		id: "name",
		title: "customer_name",
		allDay: "allDay",
		convertToUserTz: "convertToUserTz",
	},
	gantt: false,
	filters: [
		{
			fieldtype: "Link",
			fieldname: "customer",
			options: "Customer",
			label: __("Customer"),
		},
		{
			fieldtype: "Select",
			fieldname: "status",
			options: "\nDraft\nTo Bill\nCompleted\nReturn Issued\nCancelled",
			label: __("Status"),
		},
		{
			fieldtype: "Link",
			fieldname: "cm_delivery_team",
			options: "Employee",
			label: __("Delivery Team"),
		},
	],
	get_events_method:
		"casamoderna_dms.ops_calendar.get_delivery_events",
	get_css_class: function (data) {
		if (data.status === "Completed") return "success";      // Green
		if (data.status === "Cancelled") return "danger";       // Red
		if (data.cm_delivery_date) {
			var today = frappe.datetime.get_today();
			if (data.cm_delivery_date < today) return "warning"; // Orange – delayed
		}
		return "default"; // Blue – scheduled
	},
};
