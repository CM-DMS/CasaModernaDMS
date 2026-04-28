app_name = "casamoderna_dms"
app_title = "Casa Moderna DMS"
app_publisher = "Casa Moderna"
app_description = "Document management system for Casa Moderna"
app_email = "ops@casamodernadms.eu"
app_license = "mit"


# CasaModerna: Customer single-screen capture + canonical sync
# ----------------------------------------------------------

doc_events = {
	"Customer": {
		"before_insert": [
			"casamoderna_dms.customer_code_auto.assign_customer_code",
		],
		"validate": [
			"casamoderna_dms.customer_sync.validate_customer_capture",
			"casamoderna_dms.customer_hierarchy.validate_customer_hierarchy",
			"casamoderna_dms.customer_credit.validate_customer_credit",
			"casamoderna_dms.customer_disable.validate_customer_disabled",
		],
		"on_update": [
			"casamoderna_dms.customer_hierarchy.on_customer_update_hierarchy",
			"casamoderna_dms.customer_credit.on_customer_update_credit",
			"casamoderna_dms.customer_sync.sync_customer_related_records",
		],
	}
	,
	"Address": {
		"on_update": "casamoderna_dms.customer_sync.sync_customers_locality_from_address",
	}
	,
	"Quotation": {
		"before_validate": [
			"casamoderna_dms.freetext_quote_placeholders.remap_ft_item_codes",
			"casamoderna_dms.payment_milestones.clear_payment_schedule",
		],
		"validate": [
			"casamoderna_dms.cm_tile_box_to_sqm.apply_tile_box_to_sqm",
			"casamoderna_dms.cm_sales_pricing.apply_sales_doc_pricing",
			"casamoderna_dms.configurator_pricing_api.apply_configured_line_tiers",
			"casamoderna_dms.payment_milestones.recompute_payment_milestones",
			"casamoderna_dms.sales_doc_ab_split.validate_ab_split",
			"casamoderna_dms.selling_row_description.truncate_row_item_names",
			"casamoderna_dms.selling_row_description.fill_sales_doc_row_descriptions",
			"casamoderna_dms.freetext_quote_placeholders.validate_sales_doc_free_text_lines",
		],
		"after_insert": [
			"casamoderna_dms.configurator_line_hooks.ensure_custom_lines",
			"casamoderna_dms.cm_quotation_naming.sync_quotation_counter",
		],
		"on_update":    "casamoderna_dms.configurator_line_hooks.ensure_custom_lines",
	},
	"Purchase Receipt": {
		"before_validate": [
			"casamoderna_dms.batch_tracking.auto_create_batches",
		],
	},
	"Purchase Order": {
		"before_validate": [
			"casamoderna_dms.purchase_order_flow.prepare_purchase_order_snapshot",
		],
	},
	"Delivery Note": {
		"before_validate": [
			# Guard against None rounded_total fields (browser stale-state bug
			# causes abs(None) crash in ERPNext set_total_in_words).
			"casamoderna_dms.delivery_note_item_names.guard_rounded_totals",
		],
		"validate": [
			"casamoderna_dms.sales_console.validate_derived_only_delivery_note",
			"casamoderna_dms.sales_console.validate_delivery_note_sales_order_stock_only",
			# Swap item_name to main product name (not CM given name) on every save.
			"casamoderna_dms.delivery_note_item_names.apply_delivery_note_item_names",
		],
		"before_submit": [
			# Re-apply on submit to ensure final doc always carries main product names.
			"casamoderna_dms.delivery_note_item_names.apply_delivery_note_item_names",
		],
		# SMS: capture delivery date before save so we can detect changes.
		"before_save": "casamoderna_dms.sms_api.before_save_delivery_note",
		# SMS: send delivery appointment SMS when cm_delivery_date is set/changed.
		"after_save": "casamoderna_dms.sms_api.after_save_delivery_note",
	},
	"Sales Invoice": {
		"before_validate": [
			# Clear payment_schedule before validate so ERPNext rebuilds a single
			# 100%-row matching grand_total, avoiding validate_payment_schedule_amount
			# mismatch errors when invoice totals change after initial save.
			"casamoderna_dms.payment_milestones.clear_payment_schedule",
			"casamoderna_dms.invoice_credit_note_guardrails.validate_sales_invoice_return_guardrails",
		],
		"validate": [
			"casamoderna_dms.sales_console.validate_derived_only_sales_invoice",			# Recompute cm_payment_on_delivery = grand_total - deposit - survey fee.
			"casamoderna_dms.payment_milestones.recompute_payment_milestones",		],
		# Refresh cm_balance / cm_family_balance on the customer whenever
		# an invoice is submitted or cancelled.
		"on_submit": "casamoderna_dms.customer_credit.on_sales_invoice_change",
		"on_cancel": "casamoderna_dms.customer_credit.on_sales_invoice_change",
	},
	"Payment Entry": {
		# Refresh cm_balance / cm_family_balance when a payment is posted or reversed.
		"on_submit": "casamoderna_dms.customer_credit.on_payment_entry_change",
		"on_cancel": "casamoderna_dms.customer_credit.on_payment_entry_change",
	},
	"Journal Entry": {
		# Refresh cm_balance when a JE directly affects a Customer's Receivable account.
		"on_submit": "casamoderna_dms.customer_credit.on_journal_entry_change",
		"on_cancel": "casamoderna_dms.customer_credit.on_journal_entry_change",
	},
	"POS Invoice": {
		"validate": [
			"casamoderna_dms.cash_sale_guardrails.validate_cash_sale_return_guardrails",
		],
	},
	"Item": {
		"before_insert": "casamoderna_dms.product_code_auto.assign_primary_product_code",
		"before_validate": "casamoderna_dms.item_child_dedup.dedup_item_child_tables",
		"validate": [
			"casamoderna_dms.product_code_auto.sync_item_supplier_code_from_supplier",
			"casamoderna_dms.product_code_auto.sync_primary_product_code",
			"casamoderna_dms.cm_pricing.apply_item_pricing",
			"casamoderna_dms.cm_tile_master_validate.validate_tile_master_fields",
			"casamoderna_dms.item_display.sync_item_description",
			"casamoderna_dms.item_display.sync_item_display_name",
		],
		"on_update": "casamoderna_dms.cm_pricing.sync_item_price",
		"onload": [
			"casamoderna_dms.item_display.compute_item_virtual_fields",
		],
	},
	"Supplier": {
		"validate": [
			"casamoderna_dms.product_code_auto.validate_supplier_ref_3",
		],
	},
	"Sales Order": {
		"before_validate": [
			"casamoderna_dms.freetext_quote_placeholders.remap_ft_item_codes",
			"casamoderna_dms.payment_milestones.clear_payment_schedule",
		],
		"validate": [
			"casamoderna_dms.cm_tile_box_to_sqm.apply_tile_box_to_sqm",
			"casamoderna_dms.cm_sales_pricing.apply_sales_doc_pricing",
			"casamoderna_dms.configurator_pricing_api.apply_configured_line_tiers",
			"casamoderna_dms.payment_milestones.recompute_payment_milestones",
			"casamoderna_dms.sales_doc_ab_split.validate_ab_split",
			"casamoderna_dms.selling_row_description.truncate_row_item_names",
			"casamoderna_dms.selling_row_description.fill_sales_doc_row_descriptions",
			"casamoderna_dms.freetext_quote_placeholders.validate_sales_doc_free_text_lines",
		],		"after_insert": "casamoderna_dms.configurator_line_hooks.ensure_custom_lines",		"on_update": "casamoderna_dms.configurator_line_hooks.ensure_custom_lines",
		# When an amended SO is submitted, reparent any CM Custom Lines still
		# pointing at the now-cancelled predecessor so the CFG Tracker shows them.
		# classify_so_lines_on_submit runs after so CFG refs are finalised.
		"on_submit": [
			"casamoderna_dms.cfg_purchasing_api.reparent_cfg_lines_on_amendment",
			"casamoderna_dms.so_fulfillment.classify_so_lines_on_submit",
		],
		# Lock fulfilment review once the SO is Confirmed (Ready to Deliver).
		"on_update": "casamoderna_dms.so_fulfillment.lock_on_so_confirm",
	},
	"File": {
		"before_insert": "casamoderna_dms.file_hooks.before_insert_file",
	},
}


after_migrate = [
	"casamoderna_dms.cm_locality_seed.after_migrate",
]


# Calendar view JS for Delivery Note and Leave Application
# (CM Customer Appointment uses its own in-folder calendar JS automatically)
doctype_calendar_js = {
	"Delivery Note": "public/js/delivery_note_calendar.js",
	"Leave Application": "public/js/leave_application_calendar.js",
}

fixtures = [
	{
		"dt": "UOM",
		"filters": [["name", "in", ["Nos"]]],
	},
	{
		"dt": "Custom Field",
		"filters": [["dt", "in", ["Customer", "Address", "Sales Order", "Quotation", "Sales Order Item", "Quotation Item", "Item", "Company", "Supplier", "Delivery Note", "Price List", "Purchase Receipt Item", "Sales Invoice", "Sales Invoice Item", "Payment Entry", "POS Invoice", "Purchase Order", "Purchase Order Item"]]],
		"or_filters": [["fieldname", "like", "cm_%"], ["fieldname", "=", "shipping_address_name"]],
	},
	{
		"dt": "DocType",
		"filters": [["name", "in", [
			"CM Locality",
			"CM Custom Line",
			"CM Configurator Pricing",
			"CM Configurator Pricing Tier",
			"CM Configurator Pricing Matrix",
			"CM Price Calculator",
			"CM Price Calculator Step",
			"CM Price Override Request",
			"CM Customer Onboarding Request",
			"CM Registration Invitation",
		]]],
	},
	# Client Script fixture removed 2026-03-10: all 23 Frappe Desk client scripts
	# have been disabled. The React frontend does not use them.
	{
		"dt": "Print Format",
		"filters": [["name", "in", [
			"CasaModerna Quotation",
			"CasaModerna Sales Order",
			"CasaModerna Sales Invoice",
			"CasaModerna Delivery Note",
			"CasaModerna Purchase Order",
			"CasaModerna Purchase Order Inquiry",
			"CasaModerna Receipt",
			"CasaModerna Proforma",
			"CasaModerna POS Invoice",
		]]],
		# WARNING: Do NOT regenerate fixtures/print_format.json from a script.
		# The HTML contains a base64 logo + hand-tuned layout. Edit the JSON directly
		# or export from the DB with: bench export-fixtures --app casamoderna_dms
	},
	{
		"dt": "Role",
		"filters": [["name", "in", ["CasaModerna Sales Console", "CasaModerna Products Console", "CasaModerna Product Maintainer", "CasaModerna Suppliers Console", "CasaModerna Supplier Maintainer", "CasaModerna Price Supervisor"]]],
	},
	{
		"dt": "Workspace",
		"filters": [["name", "in", ["CM Operations"]]],
	},
	{
		"dt": "Workflow",
		"filters": [["name", "in", ["CM Sales Order Flow"]]],
	},
	{
		"dt": "Server Script",
		"filters": [["name", "in", ["Auto Username - name.surname"]]],
	},
	{
		"dt": "Document Naming Rule",
		"filters": [["document_type", "=", "Quotation"]],
	},
	{
		"dt": "Notification",
		"filters": [["name", "in", ["Material Request Receipt Notification", "Notification for new fiscal year"]]],
	},
	# Customer Group "Casa Moderna Internal" is seeded via master data import.
	# Removed from fixtures: the ERPNext root "All Customer Groups" is only
	# created by the setup wizard, so importing this fixture before setup
	# fails with a NestedSet parent-not-found error.
	# Property Setter, Client Script, List View Settings, List Filter
	# fixtures removed 2026-03-10: Frappe Desk UI restored to ERPNext factory default.
	# The React frontend (ONE-CasaModernaDMS) does not use Frappe Desk at all.
	# Backup of the 554 deleted property setters:
	#   sites/two.casamodernadms.eu/private/files/property_setter_backup_2026-03-10.json
]

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "casamoderna_dms",
# 		"logo": "/assets/casamoderna_dms/logo.png",
# 		"title": "CasaModerna Custom",
# 		"route": "/casamoderna_dms",
# 		"has_permission": "casamoderna_dms.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/casamoderna_dms/css/casamoderna_dms.css"
# app_include_js = "/assets/casamoderna_dms/js/casamoderna_dms.js"

# include js, css files in header of web template
# web_include_css = "/assets/casamoderna_dms/css/casamoderna_dms.css"
# web_include_js = "/assets/casamoderna_dms/js/casamoderna_dms.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "casamoderna_dms/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	"Customer": "public/js/customer.js",
	"CM Customer Onboarding Request": "casamoderna_dms/doctype/cm_customer_onboarding_request/cm_customer_onboarding_request.js",
}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "casamoderna_dms/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

jinja = {
	"methods": [
		"casamoderna_dms.print_utils.sofa_image_to_base64",
	],
}

# Installation
# ------------

# before_install = "casamoderna_dms.install.before_install"
# after_install = "casamoderna_dms.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "casamoderna_dms.uninstall.before_uninstall"
# after_uninstall = "casamoderna_dms.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "casamoderna_dms.utils.before_app_install"
# after_app_install = "casamoderna_dms.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "casamoderna_dms.utils.before_app_uninstall"
# after_app_uninstall = "casamoderna_dms.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "casamoderna_dms.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# Testing
# -------

# before_tests = "casamoderna_dms.install.before_tests"

# Overriding Methods
# ------------------------------
#
override_whitelisted_methods = {
	"frappe.core.doctype.user.user.update_password": "casamoderna_dms.password_email_confirm.update_password_with_email_confirm",
}
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "casamoderna_dms.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["casamoderna_dms.utils.before_request"]
# after_request = ["casamoderna_dms.utils.after_request"]

# Job Events
# ----------
# before_job = ["casamoderna_dms.utils.before_job"]
# after_job = ["casamoderna_dms.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"casamoderna_dms.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

