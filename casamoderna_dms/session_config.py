import frappe


def strip_session_cookie_max_age(response, request):
    """
    Remove max_age and expires from the sid cookie so it becomes a true browser-session
    cookie.  The browser discards it as soon as the user closes all browser windows,
    forcing a fresh login on next visit.
    """
    if not hasattr(frappe.local, "cookie_manager"):
        return

    sid_cookie = frappe.local.cookie_manager.cookies.get("sid")
    if sid_cookie:
        sid_cookie["max_age"] = None
        sid_cookie["expires"] = None
