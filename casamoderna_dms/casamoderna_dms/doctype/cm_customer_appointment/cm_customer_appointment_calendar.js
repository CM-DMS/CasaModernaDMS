// Copyright (c) 2026, CasaModerna and contributors
// Calendar view for CM Customer Appointment

frappe.views.calendar["CM Customer Appointment"] = {
	field_map: {
		start: "start",
		end: "end",
		id: "name",
		title: "customer_name",
		allDay: "allDay",
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
			fieldname: "appointment_type",
			options:
				"\nKitchen Consultation\nTiles Consultation\nFurniture Consultation\nSite Measurement\nAfter Sales Service",
			label: __("Appointment Type"),
		},
		{
			fieldtype: "Select",
			fieldname: "status",
			options: "Scheduled\nCompleted\nCancelled",
			label: __("Status"),
		},
		{
			fieldtype: "Link",
			fieldname: "salesperson",
			options: "User",
			label: __("Salesperson"),
		},
	],
	get_events_method:
		"casamoderna_dms.casamoderna_dms.doctype.cm_customer_appointment.cm_customer_appointment.get_events",
	get_css_class: function (data) {
		if (data.status === "Cancelled") return "danger";
		if (data.status === "Completed") return "success";
		if (
			data.appointment_type === "Site Measurement"
		)
			return "info"; // purple tint via CSS
		// Blue for consultations
		return "default";
	},
};
