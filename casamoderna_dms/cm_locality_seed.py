import frappe


CM_LOCALITY_LIST = [
	# MALTA (A→Z)
	"Attard",
	"Baħar iċ-Ċagħaq",
	"Baħrija",
	"Balzan",
	"Birgu (Vittoriosa)",
	"Birkirkara",
	"Birżebbuġa",
	"Blata l-Bajda",
	"Bormla (Cospicua)",
	"Buġibba",
	"Burmarrad",
	"Dingli",
	"Fgura",
	"Fleur-de-Lys",
	"Floriana",
	"Għadira",
	"Għargħur",
	"Għaxaq",
	"Gudja",
	"Gwardamangia",
	"Gżira",
	"Hal Far",
	"Hamrun",
	"Ibraġ",
	"Iklin",
	"Isla (Senglea)",
	"Kalkara",
	"Kirkop",
	"Lija",
	"Luqa",
	"Madliena",
	"Manikata",
	"Marsa",
	"Marsaskala",
	"Marsaxlokk",
	"Mdina",
	"Mellieħa",
	"Mosta",
	"Mqabba",
	"Msida",
	"Mtarfa",
	"Naxxar",
	"Paceville",
	"Paola (Raħal Ġdid)",
	"Pembroke",
	"Pietà",
	"Qawra",
	"Qormi",
	"Qrendi",
	"Rabat",
	"Safi",
	"San Ġiljan (St Julian’s)",
	"San Ġwann",
	"San Pawl il-Baħar (St Paul’s Bay)",
	"San Pawl tat-Tarġa",
	"Santa Luċija",
	"Santa Venera",
	"Siġġiewi",
	"Sliema",
	"Swatar",
	"Swieqi",
	"Ta’ Qali",
	"Ta’ Xbiex",
	"Tarxien",
	"Valletta",
	"Wardija",
	"Xemxija",
	"Xgħajra",
	"Żabbar",
	"Zebbiegħ",
	"Zebbuġ (Malta)",
	"Zejtun",
	"Zurrieq",
	# GOZO (A→Z)
	"Fontana - Gozo",
	"Għajnsielem - Gozo",
	"Għarb - Gozo",
	"Għasri - Gozo",
	"Kerċem - Gozo",
	"Marsalforn - Gozo",
	"Munxar - Gozo",
	"Nadur - Gozo",
	"Qala - Gozo",
	"San Lawrenz - Gozo",
	"Sannat - Gozo",
	"Victoria (Rabat - Gozo)",
	"Xagħra - Gozo",
	"Xewkija - Gozo",
	"Zebbuġ - Gozo",
]


CM_LOCALITY_MAX_SORT_ORDER = len(CM_LOCALITY_LIST)


def seed_cm_localities() -> None:
	"""Idempotent upsert of CM Locality master list.

	- Ensures each locality exists with name == locality_name
	- Enforces sort_order 1..84 in the exact list order
	"""
	if not frappe.db.exists("DocType", "CM Locality"):
		return

	seeded_set = set(CM_LOCALITY_LIST)

	for sort_order, locality_name in enumerate(CM_LOCALITY_LIST, start=1):
		if frappe.db.exists("CM Locality", locality_name):
			frappe.db.set_value(
				"CM Locality",
				locality_name,
				{"locality_name": locality_name, "sort_order": sort_order},
				update_modified=False,
			)
			continue

		doc = frappe.get_doc(
			{
				"doctype": "CM Locality",
				"locality_name": locality_name,
				"sort_order": sort_order,
			}
		)
		doc.insert(ignore_permissions=True)

	# If any extra records exist, push them out of the seeded range.
	# This keeps the Address dropdown showing the master list first.
	frappe.db.sql(
		"""
		UPDATE `tabCM Locality`
		SET sort_order = 999999
		WHERE name NOT IN %(seeded_names)s
		  AND IFNULL(sort_order, 0) <> 999999
		""",
		{
			"seeded_names": tuple(seeded_set),
		},
	)


def after_migrate() -> None:
	seed_cm_localities()
