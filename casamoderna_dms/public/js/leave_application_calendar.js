// Copyright (c) 2026, CasaModerna and contributors
// Calendar view for Leave Application – shows staff leave in Operations Calendar

frappe.views.calendar["Leave Application"] = {
	field_map: {
		start: "from_date",
		end: "to_date",
		id: "name",
		title: "employee_name",
		allDay: "allDay",
	},
	gantt: false,
	filters: [
		{
			fieldtype: "Link",
			fieldname: "employee",
			options: "Employee",
			label: __("Employee"),
		},
		{
			fieldtype: "Link",
			fieldname: "leave_type",
			options: "Leave Type",
			label: __("Leave Type"),
		},
		{
			fieldtype: "Select",
			fieldname: "status",
			options: "Open\nApproved\nRejected",
			label: __("Status"),
		},
	],
	get_events_method: "casamoderna_dms.ops_calendar.get_leave_events",
	get_css_class: function (data) {
		if (data.status === "Rejected") return "danger";
		var lt = (data.leave_type || "").toLowerCase();
		if (lt.includes("sick") || lt.includes("medical")) return "danger";   // Red
		if (lt.includes("annual") || lt.includes("vacation") || lt.includes("earned")) return "warning"; // Yellow
		return ""; // Grey / default for other leave
	},
};
