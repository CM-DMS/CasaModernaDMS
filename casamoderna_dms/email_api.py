"""
Email API — send sales documents as PDF attachments via the configured
Frappe Email Account (Brevo / Exchange / any SMTP).
"""

import base64
import os

import frappe
from frappe import _


def _build_html_message(message, doctype, name):
    """Wrap the plain-text message in a branded HTML email."""
    # Embed logo as base64 data URI (no external image hosting needed)
    logo_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "..",
        "frontend", "public", "cm-logo-print.png"
    )
    logo_html = ""
    for path in [logo_path]:
        try:
            with open(path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
            logo_html = f'<img src="data:image/png;base64,{b64}" alt="Casa Moderna" style="height:40px;" />'
            break
        except FileNotFoundError:
            continue

    # Escape message and convert newlines to <br>
    safe_msg = frappe.utils.escape_html(message).replace("\n", "<br>")

    return f"""\
<div style="font-family:'Segoe UI',Arial,sans-serif; max-width:580px; margin:0 auto; color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <!-- Logo -->
    <tr>
      <td style="padding:24px 0 20px 0; text-align:center; border-bottom:2px solid #2e7d32;">
        {logo_html or '<span style="font-size:22px; font-weight:700; color:#2e7d32; letter-spacing:1px;">Casa Moderna</span>'}
      </td>
    </tr>
    <!-- Body -->
    <tr>
      <td style="padding:24px 4px;">
        <p style="font-size:14px; line-height:1.7; margin:0; color:#444;">
          {safe_msg}
        </p>
      </td>
    </tr>
    <!-- Attachment badge -->
    <tr>
      <td style="padding:0 4px 24px 4px;">
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%;">
          <tr>
            <td style="background:#f7f8f9; border-left:3px solid #2e7d32; border-radius:4px; padding:12px 16px;">
              <span style="font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.5px;">Attachment</span><br>
              <span style="font-size:14px; font-weight:600; color:#333;">{doctype} &mdash; {name}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding:20px 4px 12px 4px; border-top:1px solid #e8e8e8; text-align:center;">
        <p style="font-size:11px; color:#999; margin:0 0 6px 0; line-height:1.6;">
          This is an automated notification &mdash; replies to this address are not monitored.
        </p>
        <p style="font-size:11px; color:#999; margin:0 0 10px 0; line-height:1.6;">
          For enquiries, email
          <a href="mailto:info@casamoderna.mt" style="color:#2e7d32; text-decoration:none; font-weight:600;">info@casamoderna.mt</a>
          or contact your salesperson directly.<br>
          Their details can be found on the attached document.
        </p>
        <p style="font-size:10px; color:#bbb; margin:0;">
          &copy; Casa Moderna Limited &middot; Malta
        </p>
      </td>
    </tr>
  </table>
</div>"""


@frappe.whitelist()
def send_document_email(doctype, name, recipients, subject=None, message=None, print_format=None):
    """Send a submitted sales document as a PDF email attachment.

    Args:
        doctype:      e.g. "Sales Invoice"
        name:         document name
        recipients:   comma-separated email addresses
        subject:      email subject (auto-generated if blank)
        message:      email body text
        print_format: Frappe print format name (e.g. "CasaModerna Sales Invoice")
    """
    allowed = {"Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Payment Entry"}
    if doctype not in allowed:
        frappe.throw(_("Email is not supported for {0}").format(doctype))

    doc = frappe.get_doc(doctype, name)
    doc.check_permission("read")

    if not recipients or not recipients.strip():
        frappe.throw(_("Please specify at least one recipient email address."))

    if not subject:
        subject = f"{doctype} {name}"

    if not message:
        message = f"Please find attached your {doctype} {name}."

    if not print_format:
        print_format = f"CasaModerna {doctype}"

    # Generate the PDF attachment
    pdf_content = frappe.get_print(
        doctype, name, print_format=print_format, as_pdf=True
    )
    filename = f"{name}.pdf"

    # Build branded HTML email body
    html_message = _build_html_message(message, doctype, name)

    frappe.sendmail(
        recipients=recipients.strip(),
        subject=subject,
        message=html_message,
        reference_doctype=doctype,
        reference_name=name,
        attachments=[{"fname": filename, "fcontent": pdf_content}],
        print_letterhead=True,
        now=True,
    )

    return {"ok": True}
