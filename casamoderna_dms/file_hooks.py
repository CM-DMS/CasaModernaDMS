"""
Hooks for the core Frappe File doctype.

before_insert: strip any leading/trailing whitespace (including CRLF) from
the folder field.  This guards against a known Werkzeug multipart-boundary
parsing quirk where the newline that separates a binary field (e.g. the
uploaded file blob) from the next plain-text field bleeds into that field's
value, producing e.g. folder = "\r\nHome/Attachments" — which then fails
Frappe's link-validation with "Could not find Folder: <value>".
"""


def before_insert_file(doc, method):
    if doc.folder:
        doc.folder = doc.folder.strip()
