"""
Client certificate management API for Frappe Desk.

Allows administrators to generate, list, download, and revoke mTLS client
certificates directly from the User form.
"""
import os
import subprocess
import zipfile
import tempfile

import frappe
from frappe import _
from frappe.utils import now_datetime

CA_DIR = "/home/frappe/casamoderna-ca"
CA_CONF = os.path.join(CA_DIR, "openssl-ca.cnf")
CLIENT_DIR = os.path.join(CA_DIR, "clients")


def _ca_passphrase():
    with open(os.path.join(CA_DIR, "ca.passphrase")) as f:
        return f.read().strip()


def _run(cmd, **kwargs):
    """Run a shell command and return stdout. Raises on failure."""
    result = subprocess.run(
        cmd, capture_output=True, text=True, check=True, **kwargs
    )
    return result.stdout


@frappe.whitelist()
def generate_certificate(user: str, device: str, days: int = 365):
    """Generate a client certificate for a user+device and attach it."""
    frappe.only_for("System Manager")

    if not frappe.db.exists("User", user):
        frappe.throw(_("User {0} does not exist").format(user))

    device = device.strip().lower().replace(" ", "-")
    if not device:
        frappe.throw(_("Device name is required"))

    # Use the Frappe username field (e.g. brian.borg) — consistent with manually issued certs
    username = frappe.db.get_value("User", user, "username") or user.split("@")[0]
    name = f"{username}-{device}"

    key_path = os.path.join(CLIENT_DIR, f"{name}.key")
    csr_path = os.path.join(CLIENT_DIR, f"{name}.csr")
    crt_path = os.path.join(CLIENT_DIR, f"{name}.crt")
    p12_path = os.path.join(CLIENT_DIR, f"{name}.p12")

    if os.path.exists(crt_path):
        frappe.throw(
            _("A certificate for {0} ({1}) already exists. Revoke it first.").format(
                user, device
            )
        )

    ca_pass = _ca_passphrase()

    # Generate client key
    _run(["openssl", "genrsa", "-out", key_path, "2048"])
    os.chmod(key_path, 0o600)

    # Generate CSR
    _run([
        "openssl", "req", "-new",
        "-key", key_path,
        "-out", csr_path,
        "-subj", f"/C=MT/O=Casa Moderna/CN={username}/OU={device}",
    ])

    # Sign with CA
    _run([
        "openssl", "ca", "-batch",
        "-config", CA_CONF,
        "-extensions", "client_cert",
        "-days", str(int(days)),
        "-in", csr_path,
        "-out", crt_path,
        "-passin", f"pass:{ca_pass}",
    ])

    # Generate export password
    export_pass = _run(["openssl", "rand", "-base64", "12"]).strip()

    # Package as PKCS#12
    _run([
        "openssl", "pkcs12", "-export",
        "-out", p12_path,
        "-inkey", key_path,
        "-in", crt_path,
        "-certfile", os.path.join(CA_DIR, "ca.crt"),
        "-name", name,
        "-passout", f"pass:{export_pass}",
    ])
    os.chmod(p12_path, 0o600)

    # Clean up CSR
    os.remove(csr_path)

    # Read cert expiry
    expiry_out = _run([
        "openssl", "x509", "-in", crt_path, "-noout", "-enddate"
    ])
    expiry = expiry_out.strip().split("=")[1] if "=" in expiry_out else "unknown"

    # Create a ZIP with the .p12 + CA cert + instructions
    zip_fname = f"{name}-certificate.zip"
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        zip_tmp_path = tmp.name

    with zipfile.ZipFile(zip_tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(p12_path, f"{name}.p12")
        zf.write(os.path.join(CA_DIR, "ca.crt"), "CasaModerna-CA.crt")
        zf.writestr("INSTALL-INSTRUCTIONS.txt", _install_instructions(name, device))

    # Attach the ZIP to the User document as a private file
    with open(zip_tmp_path, "rb") as f:
        zip_content = f.read()

    os.remove(zip_tmp_path)

    file_doc = frappe.get_doc({
        "doctype": "File",
        "file_name": zip_fname,
        "content": zip_content,
        "is_private": 1,
        "attached_to_doctype": "User",
        "attached_to_name": user,
    })
    file_doc.save(ignore_permissions=True)

    frappe.db.commit()

    return {
        "message": _("Certificate generated successfully"),
        "certificate_name": name,
        "device": device,
        "expires": expiry,
        "export_password": export_pass,
        "file_url": file_doc.file_url,
    }


@frappe.whitelist()
def list_certificates(user: str):
    """List all active certificates for a user."""
    frappe.only_for("System Manager")

    username = frappe.db.get_value("User", user, "username") or user.split("@")[0]
    certs = []

    for fname in sorted(os.listdir(CLIENT_DIR)):
        if not fname.startswith(username + "-") or not fname.endswith(".crt"):
            continue
        if fname.startswith("."):
            continue

        crt_path = os.path.join(CLIENT_DIR, fname)
        name = fname[:-4]  # strip .crt
        device = name.replace(username + "-", "", 1)

        try:
            info = _run([
                "openssl", "x509", "-in", crt_path,
                "-noout", "-enddate", "-serial",
            ])
            lines = info.strip().split("\n")
            expiry = ""
            serial = ""
            for line in lines:
                if line.startswith("notAfter="):
                    expiry = line.split("=", 1)[1]
                elif line.startswith("serial="):
                    serial = line.split("=", 1)[1]

            # Check if expired
            try:
                _run(["openssl", "x509", "-in", crt_path, "-noout", "-checkend", "0"])
                status = "Active"
            except subprocess.CalledProcessError:
                status = "Expired"
        except subprocess.CalledProcessError:
            status = "Error"
            expiry = ""
            serial = ""

        certs.append({
            "name": name,
            "device": device,
            "expiry": expiry,
            "serial": serial,
            "status": status,
        })

    return certs


@frappe.whitelist()
def revoke_certificate(user: str, device: str):
    """Revoke a client certificate and update the CRL."""
    frappe.only_for("System Manager")

    username = frappe.db.get_value("User", user, "username") or user.split("@")[0]
    device = device.strip().lower().replace(" ", "-")
    name = f"{username}-{device}"

    crt_path = os.path.join(CLIENT_DIR, f"{name}.crt")
    if not os.path.exists(crt_path):
        frappe.throw(_("No certificate found for {0} ({1})").format(user, device))

    ca_pass = _ca_passphrase()

    # Revoke
    _run([
        "openssl", "ca", "-revoke", crt_path,
        "-config", CA_CONF,
        "-passin", f"pass:{ca_pass}",
    ])

    # Regenerate CRL
    _run([
        "openssl", "ca", "-gencrl",
        "-config", CA_CONF,
        "-passin", f"pass:{ca_pass}",
        "-out", os.path.join(CA_DIR, "crl", "ca.crl"),
    ])

    # Move revoked files
    revoked_dir = os.path.join(CLIENT_DIR, "revoked")
    os.makedirs(revoked_dir, exist_ok=True)
    for ext in ("key", "crt", "p12"):
        src = os.path.join(CLIENT_DIR, f"{name}.{ext}")
        if os.path.exists(src):
            os.rename(src, os.path.join(revoked_dir, f"{name}.{ext}"))

    # Remove attached zip files from Frappe
    for f in frappe.get_all("File",
        filters={
            "attached_to_doctype": "User",
            "attached_to_name": user,
            "file_name": ["like", f"{name}%"],
        },
        pluck="name",
    ):
        frappe.delete_doc("File", f, ignore_permissions=True)

    frappe.db.commit()

    return {
        "message": _("Certificate revoked. Reload nginx to apply: sudo systemctl reload nginx"),
        "certificate_name": name,
        "nginx_reload_required": True,
    }


def _install_instructions(name, device):
    return f"""Casa Moderna DMS — Client Certificate Installation
===================================================

Certificate: {name}
Device type: {device}

STEP 1 — Install the CA root certificate
-----------------------------------------
1. Double-click "CasaModerna-CA.crt"
2. Click "Install Certificate"
3. Select "Current User" > Next
4. Select "Place all certificates in the following store" > Browse
5. Pick "Trusted Root Certification Authorities" > OK > Next > Finish
6. Click "Yes" on the security warning

STEP 2 — Install your personal certificate
-------------------------------------------
1. Double-click "{name}.p12"
2. Select "Current User" > Next
3. Enter the export password (provided separately by your admin) > Next
4. Select "Automatically select the certificate store" > Next > Finish

STEP 3 — Test
--------------
1. Close ALL browser windows (Chrome / Edge)
2. Reopen and visit: https://two.casamodernadms.eu
3. The browser will prompt you to select a certificate — pick yours
4. You should see the login page

ANDROID INSTALLATION
--------------------
1. Transfer the .p12 file to your phone
2. Go to Settings > Security > Install from storage
3. Select the .p12 file and enter the export password
4. For the CA cert: Settings > Security > Install from storage > select CasaModerna-CA.crt

If you have any issues, contact your system administrator.
"""
