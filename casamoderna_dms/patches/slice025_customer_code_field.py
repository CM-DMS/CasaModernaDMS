"""
Patch: ensure cm_customer_code custom field on Customer doctype.
"""
import frappe
from casamoderna_dms.customer_code_auto import ensure_customer_code_field


def execute():
    ensure_customer_code_field()
