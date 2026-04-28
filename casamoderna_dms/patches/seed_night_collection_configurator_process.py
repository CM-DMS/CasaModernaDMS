from __future__ import annotations

import frappe

ARES_SUPPLIER = "Ares Mobilificio S.r.l."

# =============================================================================
# GDOM code -> Italian description from Ares Listino GDOM (AGG. FEBBRAIO 2023)
# Item name IS the GDOM code - key = item.name
# =============================================================================

GDOM_ITALIAN = {
    # -------------------------------------------------------------------------
    # VANI ARMADI / CABINE / TERMINALI (senza ante) - struttura tessuto
    # -------------------------------------------------------------------------
    "1CNSTCTX001": "Vano Armadio L.45 - L.45 P.55 H.238 - Finitura Tessuto",
    "1CNSTCTX002": "Vano Armadio L.88 - L.88 P.55 H.238 - Finitura Tessuto",
    "1CNSTCTX003": "Vano Armadio L.130 - L.130 P.55 H.238 - Finitura Tessuto",
    "1CNSTCTX004": "Vano Armadio L.173 - L.173 P.55 H.238 - Finitura Tessuto",
    "1CNSTCTX005": "Vano Armadio L.216 - L.216 P.55 H.238 - Finitura Tessuto",
    "1CNSTCTX006": "Vano Armadio L.258 - L.258 P.55 H.238 - Finitura Tessuto",
    "1CNSTCTX007": "Vano Cabina L.83 - L.83 P.83 H.238 - Finitura Tessuto",
    "1CNSTCTX008": "Vano Cabina L.115 - L.115 P.115 H.238 - Finitura Tessuto",
    "1CNSTCTX009": "Terminale DX L.39,9 - L.39,9 P.55 H.238 - Finitura Tessuto",
    "1CNSTCTX010": "Terminale SX L.39,9 - L.39,9 P.55 H.238 - Finitura Tessuto",

    # -------------------------------------------------------------------------
    # STRUTTURE ARMADI BATTENTI - 1 Anta (L.45 P.55 H.238)
    # -------------------------------------------------------------------------
    "1CNSTRLW001": "Armadio 1 Anta - Struttura Olmo Bianco - L.45 P.55 H.238",
    "1CNSTRNS001": "Armadio 1 Anta - Struttura Noce Stelvio - L.45 P.55 H.238",
    "1CNSTRCE001": "Armadio 1 Anta - Struttura Grigio Cenere - L.45 P.55 H.238",
    "1CNSTRAT001": "Armadio 1 Anta - Struttura Calce - L.45 P.55 H.238",
    "1CNSTRPD001": "Armadio 1 Anta - Struttura Portland - L.45 P.55 H.238",
    "1CNSTRPG001": "Armadio 1 Anta - Struttura Frassino Ghiaccio - L.45 P.55 H.238",
    "1CNSTRKZ001": "Armadio 1 Anta - Struttura Rovere Kadiz PS 60 - L.45 P.55 H.238",
    "1CNSTRNG001": "Armadio 1 Anta - Struttura Noce Tortora Stelvio - L.45 P.55 H.238",
    "1CNSTRTX001": "Armadio 1 Anta - Struttura Tessuto - L.45 P.55 H.238",

    # STRUTTURE ARMADI BATTENTI - 2 Ante (L.88 P.55 H.238)
    "1CNSTRLW002": "Armadio 2 Ante - Struttura Olmo Bianco - L.88 P.55 H.238",
    "1CNSTRNS002": "Armadio 2 Ante - Struttura Noce Stelvio - L.88 P.55 H.238",
    "1CNSTRCE002": "Armadio 2 Ante - Struttura Grigio Cenere - L.88 P.55 H.238",
    "1CNSTRAT002": "Armadio 2 Ante - Struttura Calce - L.88 P.55 H.238",
    "1CNSTRPD002": "Armadio 2 Ante - Struttura Portland - L.88 P.55 H.238",
    "1CNSTRPG002": "Armadio 2 Ante - Struttura Frassino Ghiaccio - L.88 P.55 H.238",
    "1CNSTRKZ002": "Armadio 2 Ante - Struttura Rovere Kadiz PS 60 - L.88 P.55 H.238",
    "1CNSTRNG002": "Armadio 2 Ante - Struttura Noce Tortora Stelvio - L.88 P.55 H.238",
    "1CNSTRTX002": "Armadio 2 Ante - Struttura Tessuto - L.88 P.55 H.238",

    # STRUTTURE ARMADI BATTENTI - 3 Ante (L.130 P.55 H.238)
    "1CNSTRLW003": "Armadio 3 Ante - Struttura Olmo Bianco - L.130 P.55 H.238",
    "1CNSTRNS003": "Armadio 3 Ante - Struttura Noce Stelvio - L.130 P.55 H.238",
    "1CNSTRCE003": "Armadio 3 Ante - Struttura Grigio Cenere - L.130 P.55 H.238",
    "1CNSTRAT003": "Armadio 3 Ante - Struttura Calce - L.130 P.55 H.238",
    "1CNSTRPD003": "Armadio 3 Ante - Struttura Portland - L.130 P.55 H.238",
    "1CNSTRPG003": "Armadio 3 Ante - Struttura Frassino Ghiaccio - L.130 P.55 H.238",
    "1CNSTRKZ003": "Armadio 3 Ante - Struttura Rovere Kadiz PS 60 - L.130 P.55 H.238",
    "1CNSTRNG003": "Armadio 3 Ante - Struttura Noce Tortora Stelvio - L.130 P.55 H.238",
    "1CNSTRTX003": "Armadio 3 Ante - Struttura Tessuto - L.130 P.55 H.238",

    # STRUTTURE ARMADI BATTENTI - 4 Ante (L.173 P.55 H.238)
    "1CNSTRLW004": "Armadio 4 Ante - Struttura Olmo Bianco - L.173 P.55 H.238",
    "1CNSTRNS004": "Armadio 4 Ante - Struttura Noce Stelvio - L.173 P.55 H.238",
    "1CNSTRCE004": "Armadio 4 Ante - Struttura Grigio Cenere - L.173 P.55 H.238",
    "1CNSTRAT004": "Armadio 4 Ante - Struttura Calce - L.173 P.55 H.238",
    "1CNSTRPD004": "Armadio 4 Ante - Struttura Portland - L.173 P.55 H.238",
    "1CNSTRPG004": "Armadio 4 Ante - Struttura Frassino Ghiaccio - L.173 P.55 H.238",
    "1CNSTRKZ004": "Armadio 4 Ante - Struttura Rovere Kadiz PS 60 - L.173 P.55 H.238",
    "1CNSTRNG004": "Armadio 4 Ante - Struttura Noce Tortora Stelvio - L.173 P.55 H.238",
    "1CNSTRTX004": "Armadio 4 Ante - Struttura Tessuto - L.173 P.55 H.238",

    # STRUTTURE ARMADI BATTENTI - 5 Ante (L.216 P.55 H.238)
    "1CNSTRLW005": "Armadio 5 Ante - Struttura Olmo Bianco - L.216 P.55 H.238",
    "1CNSTRNS005": "Armadio 5 Ante - Struttura Noce Stelvio - L.216 P.55 H.238",
    "1CNSTRCE005": "Armadio 5 Ante - Struttura Grigio Cenere - L.216 P.55 H.238",
    "1CNSTRAT005": "Armadio 5 Ante - Struttura Calce - L.216 P.55 H.238",
    "1CNSTRPD005": "Armadio 5 Ante - Struttura Portland - L.216 P.55 H.238",
    "1CNSTRPG005": "Armadio 5 Ante - Struttura Frassino Ghiaccio - L.216 P.55 H.238",
    "1CNSTRKZ005": "Armadio 5 Ante - Struttura Rovere Kadiz PS 60 - L.216 P.55 H.238",
    "1CNSTRNG005": "Armadio 5 Ante - Struttura Noce Tortora Stelvio - L.216 P.55 H.238",
    "1CNSTRTX005": "Armadio 5 Ante - Struttura Tessuto - L.216 P.55 H.238",

    # STRUTTURE ARMADI BATTENTI - 6 Ante (L.258 P.55 H.238)
    "1CNSTRLW006": "Armadio 6 Ante - Struttura Olmo Bianco - L.258 P.55 H.238",
    "1CNSTRNS006": "Armadio 6 Ante - Struttura Noce Stelvio - L.258 P.55 H.238",
    "1CNSTRCE006": "Armadio 6 Ante - Struttura Grigio Cenere - L.258 P.55 H.238",
    "1CNSTRAT006": "Armadio 6 Ante - Struttura Calce - L.258 P.55 H.238",
    "1CNSTRPD006": "Armadio 6 Ante - Struttura Portland - L.258 P.55 H.238",
    "1CNSTRPG006": "Armadio 6 Ante - Struttura Frassino Ghiaccio - L.258 P.55 H.238",
    "1CNSTRKZ006": "Armadio 6 Ante - Struttura Rovere Kadiz PS 60 - L.258 P.55 H.238",
    "1CNSTRNG006": "Armadio 6 Ante - Struttura Noce Tortora Stelvio - L.258 P.55 H.238",
    "1CNSTRTX006": "Armadio 6 Ante - Struttura Tessuto - L.258 P.55 H.238",

    # STRUTTURE CABINE BATTENTI - 1 Anta (L.83 P.83 H.238)
    "1CNSTRLW007": "Cabina 1 Anta - Struttura Olmo Bianco - L.83 P.83 H.238",
    "1CNSTRNS007": "Cabina 1 Anta - Struttura Noce Stelvio - L.83 P.83 H.238",
    "1CNSTRCE007": "Cabina 1 Anta - Struttura Grigio Cenere - L.83 P.83 H.238",
    "1CNSTRAT007": "Cabina 1 Anta - Struttura Calce - L.83 P.83 H.238",
    "1CNSTRPD007": "Cabina 1 Anta - Struttura Portland - L.83 P.83 H.238",
    "1CNSTRPG007": "Cabina 1 Anta - Struttura Frassino Ghiaccio - L.83 P.83 H.238",
    "1CNSTRKZ007": "Cabina 1 Anta - Struttura Rovere Kadiz PS 60 - L.83 P.83 H.238",
    "1CNSTRNG007": "Cabina 1 Anta - Struttura Noce Tortora Stelvio - L.83 P.83 H.238",
    "1CNSTRTX007": "Cabina 1 Anta - Struttura Tessuto - L.83 P.83 H.238",

    # STRUTTURE CABINE BATTENTI - 2 Ante (L.115 P.115 H.238)
    "1CNSTRLW008": "Cabina 2 Ante - Struttura Olmo Bianco - L.115 P.115 H.238",
    "1CNSTRNS008": "Cabina 2 Ante - Struttura Noce Stelvio - L.115 P.115 H.238",
    "1CNSTRCE008": "Cabina 2 Ante - Struttura Grigio Cenere - L.115 P.115 H.238",
    "1CNSTRAT008": "Cabina 2 Ante - Struttura Calce - L.115 P.115 H.238",
    "1CNSTRPD008": "Cabina 2 Ante - Struttura Portland - L.115 P.115 H.238",
    "1CNSTRPG008": "Cabina 2 Ante - Struttura Frassino Ghiaccio - L.115 P.115 H.238",
    "1CNSTRKZ008": "Cabina 2 Ante - Struttura Rovere Kadiz PS 60 - L.115 P.115 H.238",
    "1CNSTRNG008": "Cabina 2 Ante - Struttura Noce Tortora Stelvio - L.115 P.115 H.238",
    "1CNSTRTX008": "Cabina 2 Ante - Struttura Tessuto - L.115 P.115 H.238",

    # STRUTTURE TERMINALI BATTENTI - 1 Anta DX (L.39,9 P.55 H.238)
    "1CNSTRLW009": "Terminale 1 Anta DX - Struttura Olmo Bianco - L.39,9 P.55 H.238",
    "1CNSTRNS009": "Terminale 1 Anta DX - Struttura Noce Stelvio - L.39,9 P.55 H.238",
    "1CNSTRCE009": "Terminale 1 Anta DX - Struttura Grigio Cenere - L.39,9 P.55 H.238",
    "1CNSTRAT009": "Terminale 1 Anta DX - Struttura Calce - L.39,9 P.55 H.238",
    "1CNSTRPD009": "Terminale 1 Anta DX - Struttura Portland - L.39,9 P.55 H.238",
    "1CNSTRPG009": "Terminale 1 Anta DX - Struttura Frassino Ghiaccio - L.39,9 P.55 H.238",
    "1CNSTRKZ009": "Terminale 1 Anta DX - Struttura Rovere Kadiz PS 60 - L.39,9 P.55 H.238",
    "1CNSTRNG009": "Terminale 1 Anta DX - Struttura Noce Tortora Stelvio - L.39,9 P.55 H.238",
    "1CNSTRTX009": "Terminale 1 Anta DX - Struttura Tessuto - L.39,9 P.55 H.238",

    # STRUTTURE TERMINALI BATTENTI - 1 Anta SX (L.39,9 P.55 H.238)
    "1CNSTRLW010": "Terminale 1 Anta SX - Struttura Olmo Bianco - L.39,9 P.55 H.238",
    "1CNSTRNS010": "Terminale 1 Anta SX - Struttura Noce Stelvio - L.39,9 P.55 H.238",
    "1CNSTRCE010": "Terminale 1 Anta SX - Struttura Grigio Cenere - L.39,9 P.55 H.238",
    "1CNSTRAT010": "Terminale 1 Anta SX - Struttura Calce - L.39,9 P.55 H.238",
    "1CNSTRPD010": "Terminale 1 Anta SX - Struttura Portland - L.39,9 P.55 H.238",
    "1CNSTRPG010": "Terminale 1 Anta SX - Struttura Frassino Ghiaccio - L.39,9 P.55 H.238",
    "1CNSTRKZ010": "Terminale 1 Anta SX - Struttura Rovere Kadiz PS 60 - L.39,9 P.55 H.238",
    "1CNSTRNG010": "Terminale 1 Anta SX - Struttura Noce Tortora Stelvio - L.39,9 P.55 H.238",
    "1CNSTRTX010": "Terminale 1 Anta SX - Struttura Tessuto - L.39,9 P.55 H.238",

    # STRUTTURE PONTI BATTENTI - 6 Ante (L.327 P.55 H.238)
    "1CNSTRLW011": "Ponte 6 Ante - Struttura Olmo Bianco - L.327 P.55 H.238",
    "1CNSTRNS011": "Ponte 6 Ante - Struttura Noce Stelvio - L.327 P.55 H.238",
    "1CNSTRCE011": "Ponte 6 Ante - Struttura Grigio Cenere - L.327 P.55 H.238",
    "1CNSTRAT011": "Ponte 6 Ante - Struttura Calce - L.327 P.55 H.238",
    "1CNSTRPD011": "Ponte 6 Ante - Struttura Portland - L.327 P.55 H.238",
    "1CNSTRPG011": "Ponte 6 Ante - Struttura Frassino Ghiaccio - L.327 P.55 H.238",
    "1CNSTRKZ011": "Ponte 6 Ante - Struttura Rovere Kadiz PS 60 - L.327 P.55 H.238",
    "1CNSTRNG011": "Ponte 6 Ante - Struttura Noce Tortora Stelvio - L.327 P.55 H.238",
    "1CNSTRTX011": "Ponte 6 Ante - Struttura Tessuto - L.327 P.55 H.238",

    # STRUTTURE PONTI BATTENTI - 7 Ante (L.370 P.55 H.238)
    "1CNSTRLW012": "Ponte 7 Ante - Struttura Olmo Bianco - L.370 P.55 H.238",
    "1CNSTRNS012": "Ponte 7 Ante - Struttura Noce Stelvio - L.370 P.55 H.238",
    "1CNSTRCE012": "Ponte 7 Ante - Struttura Grigio Cenere - L.370 P.55 H.238",
    "1CNSTRAT012": "Ponte 7 Ante - Struttura Calce - L.370 P.55 H.238",
    "1CNSTRPD012": "Ponte 7 Ante - Struttura Portland - L.370 P.55 H.238",
    "1CNSTRPG012": "Ponte 7 Ante - Struttura Frassino Ghiaccio - L.370 P.55 H.238",
    "1CNSTRKZ012": "Ponte 7 Ante - Struttura Rovere Kadiz PS 60 - L.370 P.55 H.238",
    "1CNSTRNG012": "Ponte 7 Ante - Struttura Noce Tortora Stelvio - L.370 P.55 H.238",
    "1CNSTRTX012": "Ponte 7 Ante - Struttura Tessuto - L.370 P.55 H.238",

    # STRUTTURE ARMADI SCORREVOLI - 3 Ante (L.258 P.55 H.238)
    "1CNSTRLW013": "Armadio Scorrevole 3 Ante - Struttura Olmo Bianco - L.258 P.55 H.238",
    "1CNSTRNS013": "Armadio Scorrevole 3 Ante - Struttura Noce Stelvio - L.258 P.55 H.238",
    "1CNSTRCE013": "Armadio Scorrevole 3 Ante - Struttura Grigio Cenere - L.258 P.55 H.238",
    "1CNSTRAT013": "Armadio Scorrevole 3 Ante - Struttura Calce - L.258 P.55 H.238",
    "1CNSTRPD013": "Armadio Scorrevole 3 Ante - Struttura Portland - L.258 P.55 H.238",
    "1CNSTRPG013": "Armadio Scorrevole 3 Ante - Struttura Frassino Ghiaccio - L.258 P.55 H.238",
    "1CNSTRKZ013": "Armadio Scorrevole 3 Ante - Struttura Rovere Kadiz PS 60 - L.258 P.55 H.238",

    # PENSILI 2 VANI A GIORNO
    "1CNSTRLW014": "Pensile 2 Vani a Giorno - Olmo Bianco - L.72 P.28 H.36",
    "1CNSTRNS014": "Pensile 2 Vani a Giorno - Noce Stelvio - L.72 P.28 H.36",
    "1CNSTRCE014": "Pensile 2 Vani a Giorno - Grigio Cenere - L.72 P.28 H.36",
    "1CNSTRAT014": "Pensile 2 Vani a Giorno - Calce - L.72 P.28 H.36",
    "1CNSTRPG014": "Pensile 2 Vani a Giorno - Frassino Ghiaccio - L.72 P.28 H.36",
    "1CNSTRKZ014": "Pensile 2 Vani a Giorno - Rovere Kadiz PS 60 - L.72 P.28 H.36",
    "1CNSTRNG014": "Pensile 2 Vani a Giorno - Noce Tortora Stelvio - L.72 P.28 H.36",

    # SCRIVANIA
    "1CNSTRLW015": "Scrivania - Olmo Bianco - L.120 P.60 H.76",
    "1CNSTRNS015": "Scrivania - Noce Stelvio - L.120 P.60 H.76",
    "1CNSTRCE015": "Scrivania - Grigio Cenere - L.120 P.60 H.76",
    "1CNSTRAT015": "Scrivania - Calce - L.120 P.60 H.76",
    "1CNSTRPG015": "Scrivania - Frassino Ghiaccio - L.120 P.60 H.76",
    "1CNSTRKZ015": "Scrivania - Rovere Kadiz PS 60 - L.120 P.60 H.76",
    "1CNSTRNG015": "Scrivania - Noce Tortora Stelvio - L.120 P.60 H.76",

    # MOBILI A GIORNO (per armadi battenti)
    "1CNSTRLW016": "Mobile a Giorno - Olmo Bianco - L.45 P.35 H.238",
    "1CNSTRNS016": "Mobile a Giorno - Noce Stelvio - L.45 P.35 H.238",
    "1CNSTRCE016": "Mobile a Giorno - Grigio Cenere - L.45 P.35 H.238",
    "1CNSTRAT016": "Mobile a Giorno - Calce - L.45 P.35 H.238",
    "1CNSTRPG016": "Mobile a Giorno - Frassino Ghiaccio - L.45 P.35 H.238",

    # MOBILE A GIORNO TERMINALE
    "1CNSTRLW017": "Mobile a Giorno Terminale - Olmo Bianco - L.53 P.35 H.238",
    "1CNSTRNS017": "Mobile a Giorno Terminale - Noce Stelvio - L.53 P.35 H.238",
    "1CNSTRCE017": "Mobile a Giorno Terminale - Grigio Cenere - L.53 P.35 H.238",
    "1CNSTRAT017": "Mobile a Giorno Terminale - Calce - L.53 P.35 H.238",
    "1CNSTRPG017": "Mobile a Giorno Terminale - Frassino Ghiaccio - L.53 P.35 H.238",

    # STRUTTURA A PONTE
    "1CNSTRLW018": "Struttura a Ponte - Olmo Bianco - L.288 P.39 H.208",
    "1CNSTRNS018": "Struttura a Ponte - Noce Stelvio - L.288 P.39 H.208",
    "1CNSTRCE018": "Struttura a Ponte - Grigio Cenere - L.288 P.39 H.208",
    "1CNSTRAT018": "Struttura a Ponte - Calce - L.288 P.39 H.208",
    "1CNSTRPG018": "Struttura a Ponte - Frassino Ghiaccio - L.288 P.39 H.208",
    "1CNSTRKZ018": "Struttura a Ponte - Rovere Kadiz PS 60 - L.288 P.39 H.208",
    "1CNSTRNG018": "Struttura a Ponte - Noce Tortora Stelvio - L.288 P.39 H.208",

    # STRUTTURE ARMADI SCORREVOLI - 2 Ante (L.172,6 P.55 H.238)
    "1CNSTRLW019": "Armadio Scorrevole 2 Ante - Struttura Olmo Bianco - L.172,6 P.55 H.238",
    "1CNSTRNS019": "Armadio Scorrevole 2 Ante - Struttura Noce Stelvio - L.172,6 P.55 H.238",
    "1CNSTRCE019": "Armadio Scorrevole 2 Ante - Struttura Grigio Cenere - L.172,6 P.55 H.238",
    "1CNSTRAT019": "Armadio Scorrevole 2 Ante - Struttura Calce - L.172,6 P.55 H.238",
    "1CNSTRPD019": "Armadio Scorrevole 2 Ante - Struttura Portland - L.172,6 P.55 H.238",
    "1CNSTRPG019": "Armadio Scorrevole 2 Ante - Struttura Frassino Ghiaccio - L.172,6 P.55 H.238",
    "1CNSTRKZ019": "Armadio Scorrevole 2 Ante - Struttura Rovere Kadiz PS 60 - L.172,6 P.55 H.238",

    # STRUTTURE ARMADI 2 ANTONI SCORREVOLI (L.274 P.64 H.240)
    "1CNSTRLW020": "Armadio 2 Antoni Scorrevoli - Struttura Olmo Bianco - L.274 P.64 H.240",
    "1CNSTRNS020": "Armadio 2 Antoni Scorrevoli - Struttura Noce Stelvio - L.274 P.64 H.240",
    "1CNSTRCE020": "Armadio 2 Antoni Scorrevoli - Struttura Grigio Cenere - L.274 P.64 H.240",
    "1CNSTRNG020": "Armadio 2 Antoni Scorrevoli - Struttura Noce Tortora Stelvio - L.274 P.64 H.240",
    "1CNSTRKZ020": "Armadio 2 Antoni Scorrevoli - Struttura Rovere Kadiz PS 60 - L.274 P.64 H.240",
    "1CNSTRPD020": "Armadio 2 Antoni Scorrevoli - Struttura Portland - L.274 P.64 H.240",
    "1CNSTRPG020": "Armadio 2 Antoni Scorrevoli - Struttura Frassino Ghiaccio - L.274 P.64 H.240",

    # PENSILE 1 VANO A GIORNO
    "1CNSTRLW021": "Pensile 1 Vano a Giorno - Olmo Bianco - L.36 P.28 H.36",
    "1CNSTRNS021": "Pensile 1 Vano a Giorno - Noce Stelvio - L.36 P.28 H.36",
    "1CNSTRCE021": "Pensile 1 Vano a Giorno - Grigio Cenere - L.36 P.28 H.36",
    "1CNSTRAT021": "Pensile 1 Vano a Giorno - Calce - L.36 P.28 H.36",
    "1CNSTRPG021": "Pensile 1 Vano a Giorno - Frassino Ghiaccio - L.36 P.28 H.36",
    "1CNSTRKZ021": "Pensile 1 Vano a Giorno - Rovere Kadiz PS 60 - L.36 P.28 H.36",
    "1CNSTRNG021": "Pensile 1 Vano a Giorno - Noce Tortora Stelvio - L.36 P.28 H.36",

    # -------------------------------------------------------------------------
    # ANTE-FRONTALI c/MANIGLIE SMALL o BIG - 1 Anta
    # -------------------------------------------------------------------------
    "1CNFROLW001": "Anta-Frontale c/Maniglia Small o Big - Olmo Bianco - 1 Anta",
    "1CNFRONS001": "Anta-Frontale c/Maniglia Small o Big - Noce Stelvio - 1 Anta",
    "1CNFROCE001": "Anta-Frontale c/Maniglia Small o Big - Grigio Cenere - 1 Anta",
    "1CNFROAT001": "Anta-Frontale c/Maniglia Small o Big - Calce - 1 Anta",
    "1CNFROCM001": "Anta-Frontale c/Maniglia Small o Big - Cemento - 1 Anta",
    "1CNFROOS001": "Anta-Frontale c/Maniglia Small o Big - Ossido - 1 Anta",
    "1CNFROBL001": "Anta-Frontale c/Maniglia Small o Big - Bianco Lucido - 1 Anta",
    "1CNFROSP001": "Anta-Frontale c/Maniglia Small o Big - Specchio - 1 Anta",
    "1CNFROPD001": "Anta-Frontale c/Maniglia Small o Big - Portland - 1 Anta",
    "1CNFROPG001": "Anta-Frontale c/Maniglia Small o Big - Frassino Ghiaccio - 1 Anta",
    "1CNFROKZ001": "Anta-Frontale c/Maniglia Small o Big - Rovere Kadiz PS 60 - 1 Anta",
    "1CNFRONG001": "Anta-Frontale c/Maniglia Small o Big - Noce Tortora Stelvio - 1 Anta",

    # ANTE-FRONTALI c/MANIGLIE SMALL o BIG - 2 Ante
    "1CNFROLW002": "Ante-Frontali c/Maniglia Small o Big - Olmo Bianco - 2 Ante",
    "1CNFRONS002": "Ante-Frontali c/Maniglia Small o Big - Noce Stelvio - 2 Ante",
    "1CNFROCE002": "Ante-Frontali c/Maniglia Small o Big - Grigio Cenere - 2 Ante",
    "1CNFROAT002": "Ante-Frontali c/Maniglia Small o Big - Calce - 2 Ante",
    "1CNFROCM002": "Ante-Frontali c/Maniglia Small o Big - Cemento - 2 Ante",
    "1CNFROOS002": "Ante-Frontali c/Maniglia Small o Big - Ossido - 2 Ante",
    "1CNFROBL002": "Ante-Frontali c/Maniglia Small o Big - Bianco Lucido - 2 Ante",
    "1CNFROSP002": "Ante-Frontali c/Maniglia Small o Big - Specchio - 2 Ante",
    "1CNFROPD002": "Ante-Frontali c/Maniglia Small o Big - Portland - 2 Ante",
    "1CNFROPG002": "Ante-Frontali c/Maniglia Small o Big - Frassino Ghiaccio - 2 Ante",
    "1CNFROKZ002": "Ante-Frontali c/Maniglia Small o Big - Rovere Kadiz PS 60 - 2 Ante",
    "1CNFRONG002": "Ante-Frontali c/Maniglia Small o Big - Noce Tortora Stelvio - 2 Ante",

    # ANTE-FRONTALI c/MANIGLIA GOLA - 1 Anta
    "1CNFROLW003": "Anta-Frontale c/Maniglia Gola - Olmo Bianco - 1 Anta",
    "1CNFRONS003": "Anta-Frontale c/Maniglia Gola - Noce Stelvio - 1 Anta",
    "1CNFROCE003": "Anta-Frontale c/Maniglia Gola - Grigio Cenere - 1 Anta",
    "1CNFROAT003": "Anta-Frontale c/Maniglia Gola - Calce - 1 Anta",
    "1CNFROCM003": "Anta-Frontale c/Maniglia Gola - Cemento - 1 Anta",
    "1CNFROOS003": "Anta-Frontale c/Maniglia Gola - Ossido - 1 Anta",
    "1CNFROBL003": "Anta-Frontale c/Maniglia Gola - Bianco Lucido - 1 Anta",
    "1CNFROPD003": "Anta-Frontale c/Maniglia Gola - Portland - 1 Anta",
    "1CNFROPG003": "Anta-Frontale c/Maniglia Gola - Frassino Ghiaccio - 1 Anta",
    "1CNFROKZ003": "Anta-Frontale c/Maniglia Gola - Rovere Kadiz PS 60 - 1 Anta",
    "1CNFRONG003": "Anta-Frontale c/Maniglia Gola - Noce Tortora Stelvio - 1 Anta",

    # ANTE-FRONTALI c/MANIGLIA GOLA - 2 Ante (pacco: 1 anta liscia + 1 c/predisposizione)
    "1CNFROLW004": "Ante-Frontali c/Maniglia Gola - Olmo Bianco - Pacco 2 Ante",
    "1CNFRONS004": "Ante-Frontali c/Maniglia Gola - Noce Stelvio - Pacco 2 Ante",
    "1CNFROCE004": "Ante-Frontali c/Maniglia Gola - Grigio Cenere - Pacco 2 Ante",
    "1CNFROAT004": "Ante-Frontali c/Maniglia Gola - Calce - Pacco 2 Ante",
    "1CNFROCM004": "Ante-Frontali c/Maniglia Gola - Cemento - Pacco 2 Ante",
    "1CNFROOS004": "Ante-Frontali c/Maniglia Gola - Ossido - Pacco 2 Ante",
    "1CNFROBL004": "Ante-Frontali c/Maniglia Gola - Bianco Lucido - Pacco 2 Ante",
    "1CNFROPD004": "Ante-Frontali c/Maniglia Gola - Portland - Pacco 2 Ante",
    "1CNFROPG004": "Ante-Frontali c/Maniglia Gola - Frassino Ghiaccio - Pacco 2 Ante",
    "1CNFROKZ004": "Ante-Frontali c/Maniglia Gola - Rovere Kadiz PS 60 - Pacco 2 Ante",
    "1CNFRONG004": "Ante-Frontali c/Maniglia Gola - Noce Tortora Stelvio - Pacco 2 Ante",

    # ANTE-FRONTALI PONTE - 4 Ante Piccole c/Maniglie Small o Big
    "1CNFROLW005": "Ante-Frontali Ponte c/Maniglia Small o Big - Olmo Bianco - 4 Ante Piccole",
    "1CNFRONS005": "Ante-Frontali Ponte c/Maniglia Small o Big - Noce Stelvio - 4 Ante Piccole",
    "1CNFROCE005": "Ante-Frontali Ponte c/Maniglia Small o Big - Grigio Cenere - 4 Ante Piccole",
    "1CNFROAT005": "Ante-Frontali Ponte c/Maniglia Small o Big - Calce - 4 Ante Piccole",
    "1CNFROCM005": "Ante-Frontali Ponte c/Maniglia Small o Big - Cemento - 4 Ante Piccole",
    "1CNFROOS005": "Ante-Frontali Ponte c/Maniglia Small o Big - Ossido - 4 Ante Piccole",
    "1CNFROBL005": "Ante-Frontali Ponte c/Maniglia Small o Big - Bianco Lucido - 4 Ante Piccole",
    "1CNFROPD005": "Ante-Frontali Ponte c/Maniglia Small o Big - Portland - 4 Ante Piccole",
    "1CNFROPG005": "Ante-Frontali Ponte c/Maniglia Small o Big - Frassino Ghiaccio - 4 Ante Piccole",
    "1CNFROKZ005": "Ante-Frontali Ponte c/Maniglia Small o Big - Rovere Kadiz PS 60 - 4 Ante Piccole",
    "1CNFRONG005": "Ante-Frontali Ponte c/Maniglia Small o Big - Noce Tortora Stelvio - 4 Ante Piccole",

    # SET FRONTALI ARMADIO SCORREVOLE 3 ANTE (2 legno 1 specchio)
    "1CNFROLW006": "Set Frontali Scorrevole 3 Ante (2 legno 1 specchio) - Olmo Bianco",
    "1CNFRONS006": "Set Frontali Scorrevole 3 Ante (2 legno 1 specchio) - Noce Stelvio",
    "1CNFROCE006": "Set Frontali Scorrevole 3 Ante (2 legno 1 specchio) - Grigio Cenere",
    "1CNFROAT006": "Set Frontali Scorrevole 3 Ante (2 legno 1 specchio) - Calce",
    "1CNFROBL006": "Set Frontali Scorrevole 3 Ante (2 legno 1 specchio) - Bianco Lucido",
    "1CNFROPD006": "Set Frontali Scorrevole 3 Ante (2 legno 1 specchio) - Portland",
    "1CNFROPG006": "Set Frontali Scorrevole 3 Ante (2 legno 1 specchio) - Frassino Ghiaccio",
    "1CNFROKZ006": "Set Frontali Scorrevole 3 Ante (2 legno 1 specchio) - Rovere Kadiz PS 60",

    # SET FRONTALI ARMADIO SCORREVOLE 2 ANTE - tutto legno
    "1CNFROLW007": "Set Frontali Scorrevole 2 Ante - Olmo Bianco",
    "1CNFRONS007": "Set Frontali Scorrevole 2 Ante - Noce Stelvio",
    "1CNFROCE007": "Set Frontali Scorrevole 2 Ante - Grigio Cenere",
    "1CNFROAT007": "Set Frontali Scorrevole 2 Ante - Calce",
    "1CNFROBL007": "Set Frontali Scorrevole 2 Ante - Bianco Lucido",
    "1CNFROPD007": "Set Frontali Scorrevole 2 Ante - Portland",
    "1CNFROPG007": "Set Frontali Scorrevole 2 Ante - Frassino Ghiaccio",
    "1CNFROKZ007": "Set Frontali Scorrevole 2 Ante - Rovere Kadiz PS 60",

    # SET FRONTALI ARMADIO SCORREVOLE 3 ANTE - tutto legno
    "1CNFROLW008": "Set Frontali Scorrevole 3 Ante - Olmo Bianco",
    "1CNFRONS008": "Set Frontali Scorrevole 3 Ante - Noce Stelvio",
    "1CNFROCE008": "Set Frontali Scorrevole 3 Ante - Grigio Cenere",
    "1CNFROAT008": "Set Frontali Scorrevole 3 Ante - Calce",
    "1CNFROBL008": "Set Frontali Scorrevole 3 Ante - Bianco Lucido",
    "1CNFROPD008": "Set Frontali Scorrevole 3 Ante - Portland",
    "1CNFROPG008": "Set Frontali Scorrevole 3 Ante - Frassino Ghiaccio",
    "1CNFROKZ008": "Set Frontali Scorrevole 3 Ante - Rovere Kadiz PS 60",

    # SET FRONTALI ARMADIO SCORREVOLE 2 ANTE (1 legno 1 specchio)
    "1CNFROLW009": "Set Frontali Scorrevole 2 Ante (1 legno 1 specchio) - Olmo Bianco",
    "1CNFRONS009": "Set Frontali Scorrevole 2 Ante (1 legno 1 specchio) - Noce Stelvio",
    "1CNFROCE009": "Set Frontali Scorrevole 2 Ante (1 legno 1 specchio) - Grigio Cenere",
    "1CNFROAT009": "Set Frontali Scorrevole 2 Ante (1 legno 1 specchio) - Calce",
    "1CNFROBL009": "Set Frontali Scorrevole 2 Ante (1 legno 1 specchio) - Bianco Lucido",
    "1CNFROPD009": "Set Frontali Scorrevole 2 Ante (1 legno 1 specchio) - Portland",
    "1CNFROPG009": "Set Frontali Scorrevole 2 Ante (1 legno 1 specchio) - Frassino Ghiaccio",
    "1CNFROKZ009": "Set Frontali Scorrevole 2 Ante (1 legno 1 specchio) - Rovere Kadiz PS 60",

    # FRONTALI 2 ANTONI SCORREVOLI - Ante Riquadrate
    "1CNFROLW020": "Frontali 2 Antoni Scorrevoli - 2 Ante Riquadrate - Olmo Bianco",
    "1CNFRONS020": "Frontali 2 Antoni Scorrevoli - 2 Ante Riquadrate - Noce Stelvio",
    "1CNFROCE020": "Frontali 2 Antoni Scorrevoli - 2 Ante Riquadrate - Grigio Cenere",
    "1CNFRONG020": "Frontali 2 Antoni Scorrevoli - 2 Ante Riquadrate - Noce Tortora Stelvio",
    "1CNFROKZ020": "Frontali 2 Antoni Scorrevoli - 2 Ante Riquadrate - Rovere Kadiz PS 60",

    # FRONTALI 2 ANTONI SCORREVOLI - Ante Specchio Fumè
    "1CNFROFU011": "Frontali 2 Antoni Scorrevoli - Ante Specchio Fumè - Telaio Alluminio Canna di Fucile RAL 7022",

    # FRONTALI 2 ANTONI SCORREVOLI - Ante Specchio
    "1CNFROBR012": "Frontali 2 Antoni Scorrevoli - Ante Specchio - Telaio Alluminio Brill",

    # -------------------------------------------------------------------------
    # MANIGLIE
    # -------------------------------------------------------------------------

    # Maniglia Small / Big - per struttura (colore abbinato)
    "1CNMANLW001": "Maniglia Small - Colore Olmo Bianco - n°1 maniglia",
    "1CNMANNS001": "Maniglia Small - Colore Noce Stelvio - n°1 maniglia",
    "1CNMANCE001": "Maniglia Small - Colore Grigio Cenere - n°1 maniglia",
    "1CNMANAT001": "Maniglia Small - Colore Calce - n°1 maniglia",
    "1CNMANPD001": "Maniglia Small - Colore Portland - n°1 maniglia",
    "1CNMANPG001": "Maniglia Small - Colore Frassino Ghiaccio - n°1 maniglia",
    "1CNMANKZ001": "Maniglia Small - Colore Rovere Kadiz PS 60 - n°1 maniglia",
    "1CNMANNG001": "Maniglia Small - Colore Noce Tortora Stelvio - n°1 maniglia",

    "1CNMANLW004": "Maniglia Big - Colore Olmo Bianco - n°1 maniglia",
    "1CNMANNS004": "Maniglia Big - Colore Noce Stelvio - n°1 maniglia",
    "1CNMANCE004": "Maniglia Big - Colore Grigio Cenere - n°1 maniglia",
    "1CNMANAT004": "Maniglia Big - Colore Calce - n°1 maniglia",
    "1CNMANPD004": "Maniglia Big - Colore Portland - n°1 maniglia",
    "1CNMANPG004": "Maniglia Big - Colore Frassino Ghiaccio - n°1 maniglia",
    "1CNMANKZ004": "Maniglia Big - Colore Rovere Kadiz PS 60 - n°1 maniglia",
    "1CNMANNG004": "Maniglia Big - Colore Noce Tortora Stelvio - n°1 maniglia",

    # Maniglia Gola - Grigio Cenere (per tutte le finiture struttura)
    "1CNMANCE007": "Maniglia Gola - Colore Grigio Cenere - n°1 maniglia",

    # Maniglie e Profili 2 Antoni Scorrevoli
    "1CNMANLW010": "Maniglie e Profili 2 Antoni Scorrevoli - Olmo Bianco",
    "1CNMANNS010": "Maniglie e Profili 2 Antoni Scorrevoli - Noce Stelvio",
    "1CNMANCE010": "Maniglie e Profili 2 Antoni Scorrevoli - Grigio Cenere",
    "1CNMANNG010": "Maniglie e Profili 2 Antoni Scorrevoli - Noce Tortora Stelvio",
    "1CNMANKZ010": "Maniglie e Profili 2 Antoni Scorrevoli - Rovere Kadiz PS 60",

    # -------------------------------------------------------------------------
    # ACCESSORI ARMADI BATTENTI E SCORREVOLI
    # -------------------------------------------------------------------------
    "1CNACCTX001": "Ripiano da 45 - per Armadio Battente - L.40,9 P.51 H.3,8",
    "1CNACCTX002": "Ripiano da 90 - per Armadio Battente e Scorrevole - L.83,6 P.51 H.3,8",
    "1CNACCTX003": "Ripiano Modulo per Cabina 2 Ante - L.111,4 P.49,2 H.3,8",
    "1CNACCTX004": "Cassettiera Interna - per Armadio Battente e Scorrevole - L.83,6 P.45 H.41,8",
    "1CNACCTX005": "Porta Pantaloni - per Armadio Battente - L.75 P.48 H.2,5",
    "1CNACCTX006": "Porta Cravatte - per Armadio Battente - L.75 P.48 H.6,2",
    "1CNACCTX007": "Servetto Moka - per Armadio Battente e Scorrevole - L.83-115 P.75 H.85",
    "1CNACCTX008": "Porta Pantaloni - per Armadio Scorrevole - L.75 P.48 H.2,5",
    "1CNACCTX009": "Porta Cravatte - per Armadio Scorrevole - L.75 P.48 H.6,2",
    "1CNACCTX010": "Servetto Moka - per Armadio Battente e Scorrevole (cod. alt.) - L.83-115 P.75 H.85",
    "1CNACCTX015": "Ripiano Modulo per Cabina 1 Anta - L.81,2 P.49,2 H.3,8",

    # LED ARMADI
    "1CNACCXX012": "LED per Armadi - L.15 P.6,5 H.1,4",

    # CAPPELLO CORNICE con Luce LED - per Armadio 6 Ante Battenti
    "1CNACCLW011": "Cappello Cornice con Luce LED - per Armadio 6 Ante Battenti - Olmo Bianco - L.263,5 P.15 H.242",
    "1CNACCNS011": "Cappello Cornice con Luce LED - per Armadio 6 Ante Battenti - Noce Stelvio - L.263,5 P.15 H.242",
    "1CNACCCE011": "Cappello Cornice con Luce LED - per Armadio 6 Ante Battenti - Grigio Cenere - L.263,5 P.15 H.242",
    "1CNACCAT011": "Cappello Cornice con Luce LED - per Armadio 6 Ante Battenti - Calce - L.263,5 P.15 H.242",
    "1CNACCPG011": "Cappello Cornice con Luce LED - per Armadio 6 Ante Battenti - Frassino Ghiaccio - L.263,5 P.15 H.242",

    # LED PONTE E GRIGLIA SOTTOPONTE
    "1CNACCXX014": "LED per Ponte - L.15 P.6,5 H.1,4",
    "1CNACCLW014": "Griglia Sottoponte - Olmo Bianco - L.238 P.26 H.141",
    "1CNACCNS014": "Griglia Sottoponte - Noce Stelvio - L.238 P.26 H.141",
    "1CNACCCE014": "Griglia Sottoponte - Grigio Cenere - L.238 P.26 H.141",
    "1CNACCAT014": "Griglia Sottoponte - Calce - L.238 P.26 H.141",
    "1CNACCPG014": "Griglia Sottoponte - Frassino Ghiaccio - L.238 P.26 H.141",

    # PROFILI CON LED (per specchiera)
    "1CNACCCE015": "Profili con LED per Specchiera - Grigio Cenere",

    # ACCESSORI SOLO PER ARMADI 2 ANTONI SCORREVOLI
    "1FHTX2000": "Vano Attrezzato con Cassettiera 3 Cassetti - per Armadi 2 Antoni Scorrevoli - L.133 P.55,5 H.110",
    "1FHTX2006": "Ripiano Interno - per Armadi 2 Antoni Scorrevoli - L.133,2 P.55,5 H.3,8",

    # ACCESSORI - codici alternativi 1SPTX (come registrati in ERPNext)
    "1SPTX2117": "Cassettiera Interna - per Armadio Battente e Scorrevole - L.83,6 P.45 H.41,8",
    "1SPTX2119": "Porta Cravatte - per Armadio Battente - L.75 P.48 H.6,2",
    "1SPTX2120": "Porta Pantaloni - per Armadio Battente - L.75 P.48 H.2,5",
    "1SPTX2121": "Servetto Moka - per Armadio Battente e Scorrevole - L.83-115 P.75 H.85",
    "1SPTX2122": "Porta Cravatte - per Armadio Scorrevole - L.75 P.48 H.6,2",
    "1SPTX2123": "Porta Pantaloni - per Armadio Scorrevole - L.75 P.48 H.2,5",

    # -------------------------------------------------------------------------
    # GRUPPO "COMPO NIGHT" - Comodino 2 Cassetti (L.53 P.43 H.43)
    # -------------------------------------------------------------------------
    "1CNCMDLW001LW": "Comodino 2 Cassetti Compo Night - Struttura Olmo Bianco / Frontale Olmo Bianco - L.53 P.43 H.43",
    "1CNCMDLW001CE": "Comodino 2 Cassetti Compo Night - Struttura Olmo Bianco / Frontale Grigio Cenere - L.53 P.43 H.43",
    "1CNCMDLW001AT": "Comodino 2 Cassetti Compo Night - Struttura Olmo Bianco / Frontale Calce - L.53 P.43 H.43",
    "1CNCMDLW001BL": "Comodino 2 Cassetti Compo Night - Struttura Olmo Bianco / Frontale Bianco Lucido - L.53 P.43 H.43",
    "1CNCMDNS001NS": "Comodino 2 Cassetti Compo Night - Struttura Noce Stelvio / Frontale Noce Stelvio - L.53 P.43 H.43",
    "1CNCMDNS001CE": "Comodino 2 Cassetti Compo Night - Struttura Noce Stelvio / Frontale Grigio Cenere - L.53 P.43 H.43",
    "1CNCMDNS001AT": "Comodino 2 Cassetti Compo Night - Struttura Noce Stelvio / Frontale Calce - L.53 P.43 H.43",
    "1CNCMDNS001BL": "Comodino 2 Cassetti Compo Night - Struttura Noce Stelvio / Frontale Bianco Lucido - L.53 P.43 H.43",
    "1CNCMDCE001CE": "Comodino 2 Cassetti Compo Night - Struttura Grigio Cenere / Frontale Grigio Cenere - L.53 P.43 H.43",
    "1CNCMDCE001AT": "Comodino 2 Cassetti Compo Night - Struttura Grigio Cenere / Frontale Calce - L.53 P.43 H.43",
    "1CNCMDCE001BL": "Comodino 2 Cassetti Compo Night - Struttura Grigio Cenere / Frontale Bianco Lucido - L.53 P.43 H.43",
    "1CNCMDAT001AT": "Comodino 2 Cassetti Compo Night - Struttura Calce / Frontale Calce - L.53 P.43 H.43",
    "1CNCMDAT001CE": "Comodino 2 Cassetti Compo Night - Struttura Calce / Frontale Grigio Cenere - L.53 P.43 H.43",
    "1CNCMDAT001BL": "Comodino 2 Cassetti Compo Night - Struttura Calce / Frontale Bianco Lucido - L.53 P.43 H.43",
    "1CNCMDPG001PG": "Comodino 2 Cassetti Compo Night - Struttura Frassino Ghiaccio / Frontale Frassino Ghiaccio - L.53 P.43 H.43",
    "1CNCMDPG001CE": "Comodino 2 Cassetti Compo Night - Struttura Frassino Ghiaccio / Frontale Grigio Cenere - L.53 P.43 H.43",
    "1CNCMDPG001AT": "Comodino 2 Cassetti Compo Night - Struttura Frassino Ghiaccio / Frontale Calce - L.53 P.43 H.43",
    "1CNCMDPG001BL": "Comodino 2 Cassetti Compo Night - Struttura Frassino Ghiaccio / Frontale Bianco Lucido - L.53 P.43 H.43",

    # GRUPPO "COMPO NIGHT" - Cassettiera solo maniglia piccola (L.43 P.46 H.55)
    "1CNCMDLW002LW": "Cassettiera Compo Night c/Maniglia Piccola - Olmo Bianco - L.43 P.46 H.55",
    "1CNCMDNS002NS": "Cassettiera Compo Night c/Maniglia Piccola - Noce Stelvio - L.43 P.46 H.55",
    "1CNCMDCE002CE": "Cassettiera Compo Night c/Maniglia Piccola - Grigio Cenere - L.43 P.46 H.55",
    "1CNCMDAT002AT": "Cassettiera Compo Night c/Maniglia Piccola - Calce - L.43 P.46 H.55",
    "1CNCMDPG002PG": "Cassettiera Compo Night c/Maniglia Piccola - Frassino Ghiaccio - L.43 P.46 H.55",
    "1CNCMDKZ002KZ": "Cassettiera Compo Night c/Maniglia Piccola - Rovere Kadiz PS 60 - L.43 P.46 H.55",
    "1CNCMDNG002NG": "Cassettiera Compo Night c/Maniglia Piccola - Noce Tortora Stelvio - L.43 P.46 H.55",

    # GRUPPO "COMPO NIGHT" - Settimino 6 Cassetti (L.53 P.43 H.120)
    "1CNSETLW001LW": "Settimino 6 Cassetti Compo Night - Struttura Olmo Bianco / Frontale Olmo Bianco - L.53 P.43 H.120",
    "1CNSETLW001CE": "Settimino 6 Cassetti Compo Night - Struttura Olmo Bianco / Frontale Grigio Cenere - L.53 P.43 H.120",
    "1CNSETLW001AT": "Settimino 6 Cassetti Compo Night - Struttura Olmo Bianco / Frontale Calce - L.53 P.43 H.120",
    "1CNSETLW001BL": "Settimino 6 Cassetti Compo Night - Struttura Olmo Bianco / Frontale Bianco Lucido - L.53 P.43 H.120",
    "1CNSETNS001NS": "Settimino 6 Cassetti Compo Night - Struttura Noce Stelvio / Frontale Noce Stelvio - L.53 P.43 H.120",
    "1CNSETNS001CE": "Settimino 6 Cassetti Compo Night - Struttura Noce Stelvio / Frontale Grigio Cenere - L.53 P.43 H.120",
    "1CNSETNS001AT": "Settimino 6 Cassetti Compo Night - Struttura Noce Stelvio / Frontale Calce - L.53 P.43 H.120",
    "1CNSETNS001BL": "Settimino 6 Cassetti Compo Night - Struttura Noce Stelvio / Frontale Bianco Lucido - L.53 P.43 H.120",
    "1CNSETCE001CE": "Settimino 6 Cassetti Compo Night - Struttura Grigio Cenere / Frontale Grigio Cenere - L.53 P.43 H.120",
    "1CNSETCE001AT": "Settimino 6 Cassetti Compo Night - Struttura Grigio Cenere / Frontale Calce - L.53 P.43 H.120",
    "1CNSETCE001BL": "Settimino 6 Cassetti Compo Night - Struttura Grigio Cenere / Frontale Bianco Lucido - L.53 P.43 H.120",
    "1CNSETAT001AT": "Settimino 6 Cassetti Compo Night - Struttura Calce / Frontale Calce - L.53 P.43 H.120",
    "1CNSETAT001CE": "Settimino 6 Cassetti Compo Night - Struttura Calce / Frontale Grigio Cenere - L.53 P.43 H.120",
    "1CNSETAT001BL": "Settimino 6 Cassetti Compo Night - Struttura Calce / Frontale Bianco Lucido - L.53 P.43 H.120",
    "1CNSETPG001PG": "Settimino 6 Cassetti Compo Night - Struttura Frassino Ghiaccio / Frontale Frassino Ghiaccio - L.53 P.43 H.120",
    "1CNSETPG001CE": "Settimino 6 Cassetti Compo Night - Struttura Frassino Ghiaccio / Frontale Grigio Cenere - L.53 P.43 H.120",
    "1CNSETPG001AT": "Settimino 6 Cassetti Compo Night - Struttura Frassino Ghiaccio / Frontale Calce - L.53 P.43 H.120",
    "1CNSETPG001BL": "Settimino 6 Cassetti Compo Night - Struttura Frassino Ghiaccio / Frontale Bianco Lucido - L.53 P.43 H.120",

    # GRUPPO "COMPO NIGHT" - Comò 3 Cassetti (L.122 P.48 H.81)
    "1CNCMOLW001LW": "Comò 3 Cassetti Compo Night - Struttura Olmo Bianco / Frontale Olmo Bianco - L.122 P.48 H.81",
    "1CNCMOLW001CE": "Comò 3 Cassetti Compo Night - Struttura Olmo Bianco / Frontale Grigio Cenere - L.122 P.48 H.81",
    "1CNCMOLW001AT": "Comò 3 Cassetti Compo Night - Struttura Olmo Bianco / Frontale Calce - L.122 P.48 H.81",
    "1CNCMOLW001BL": "Comò 3 Cassetti Compo Night - Struttura Olmo Bianco / Frontale Bianco Lucido - L.122 P.48 H.81",
    "1CNCMONS001NS": "Comò 3 Cassetti Compo Night - Struttura Noce Stelvio / Frontale Noce Stelvio - L.122 P.48 H.81",
    "1CNCMONS001CE": "Comò 3 Cassetti Compo Night - Struttura Noce Stelvio / Frontale Grigio Cenere - L.122 P.48 H.81",
    "1CNCMONS001AT": "Comò 3 Cassetti Compo Night - Struttura Noce Stelvio / Frontale Calce - L.122 P.48 H.81",
    "1CNCMONS001BL": "Comò 3 Cassetti Compo Night - Struttura Noce Stelvio / Frontale Bianco Lucido - L.122 P.48 H.81",
    "1CNCMOCE001CE": "Comò 3 Cassetti Compo Night - Struttura Grigio Cenere / Frontale Grigio Cenere - L.122 P.48 H.81",
    "1CNCMOCE001AT": "Comò 3 Cassetti Compo Night - Struttura Grigio Cenere / Frontale Calce - L.122 P.48 H.81",
    "1CNCMOCE001BL": "Comò 3 Cassetti Compo Night - Struttura Grigio Cenere / Frontale Bianco Lucido - L.122 P.48 H.81",
    "1CNCMOAT001AT": "Comò 3 Cassetti Compo Night - Struttura Calce / Frontale Calce - L.122 P.48 H.81",
    "1CNCMOAT001CE": "Comò 3 Cassetti Compo Night - Struttura Calce / Frontale Grigio Cenere - L.122 P.48 H.81",
    "1CNCMOAT001BL": "Comò 3 Cassetti Compo Night - Struttura Calce / Frontale Bianco Lucido - L.122 P.48 H.81",
    "1CNCMOPG001PG": "Comò 3 Cassetti Compo Night - Struttura Frassino Ghiaccio / Frontale Frassino Ghiaccio - L.122 P.48 H.81",
    "1CNCMOPG001CE": "Comò 3 Cassetti Compo Night - Struttura Frassino Ghiaccio / Frontale Grigio Cenere - L.122 P.48 H.81",
    "1CNCMOPG001AT": "Comò 3 Cassetti Compo Night - Struttura Frassino Ghiaccio / Frontale Calce - L.122 P.48 H.81",
    "1CNCMOPG001BL": "Comò 3 Cassetti Compo Night - Struttura Frassino Ghiaccio / Frontale Bianco Lucido - L.122 P.48 H.81",

    # PENSILE QUADRATO 60x60 CON ANTA PUSH
    "1CNPENLW001LW": "Pensile Quadrato 60x60 con Anta Push - Olmo Bianco - L.60 P.33 H.60",
    "1CNPENNS001NS": "Pensile Quadrato 60x60 con Anta Push - Noce Stelvio - L.60 P.33 H.60",
    "1CNPENCE001CE": "Pensile Quadrato 60x60 con Anta Push - Grigio Cenere - L.60 P.33 H.60",
    "1CNPENAT001AT": "Pensile Quadrato 60x60 con Anta Push - Calce - L.60 P.33 H.60",
    "1CNPENPG001PG": "Pensile Quadrato 60x60 con Anta Push - Frassino Ghiaccio - L.60 P.33 H.60",
    "1CNPENKZ001KZ": "Pensile Quadrato 60x60 con Anta Push - Rovere Kadiz PS 60 - L.60 P.33 H.60",
    "1CNPENNG001NG": "Pensile Quadrato 60x60 con Anta Push - Noce Tortora Stelvio - L.60 P.33 H.60",

    # -------------------------------------------------------------------------
    # GRUPPO "ORIONE"
    # -------------------------------------------------------------------------
    "1CNCMDKZ006": "Comodino 2 Cassetti Orione - Rovere Kadiz PS 60 - L.58 P.46 H.48",
    "1CNSETKZ004": "Settimino 6 Cassetti Orione - Rovere Kadiz PS 60 - L.58 P.46 H.117",
    "1CNCMOKZ007": "Comò 3 Cassetti Orione - Rovere Kadiz PS 60 - L.120 P.46 H.78",
    "1CNCMOKZ004": "Comò 6 Cassetti Orione - Rovere Kadiz PS 60 - L.160 P.46 H.78",

    # -------------------------------------------------------------------------
    # GRUPPO "NETTUNO"
    # -------------------------------------------------------------------------
    "1CNCMDLW005": "Comodino 2 Cassetti Nettuno - Olmo Bianco - L.51 P.46 H.48",
    "1CNCMDNS005": "Comodino 2 Cassetti Nettuno - Noce Stelvio - L.51 P.46 H.48",
    "1CNCMDCE005": "Comodino 2 Cassetti Nettuno - Grigio Cenere - L.51 P.46 H.48",
    "1CNCMDKZ005": "Comodino 2 Cassetti Nettuno - Rovere Kadiz PS 60 - L.51 P.46 H.48",
    "1CNCMDNG005": "Comodino 2 Cassetti Nettuno - Noce Tortora Stelvio - L.51 P.46 H.48",
    "1CNSETLW005": "Settimino 6 Cassetti Nettuno - Olmo Bianco - L.51 P.46 H.117",
    "1CNSETNS005": "Settimino 6 Cassetti Nettuno - Noce Stelvio - L.51 P.46 H.117",
    "1CNSETCE005": "Settimino 6 Cassetti Nettuno - Grigio Cenere - L.51 P.46 H.117",
    "1CNSETKZ005": "Settimino 6 Cassetti Nettuno - Rovere Kadiz PS 60 - L.51 P.46 H.117",
    "1CNSETNG005": "Settimino 6 Cassetti Nettuno - Noce Tortora Stelvio - L.51 P.46 H.117",
    "1CNCMOLW005": "Comò 3 Cassetti Nettuno - Olmo Bianco - L.120 P.46 H.78",
    "1CNCMONS005": "Comò 3 Cassetti Nettuno - Noce Stelvio - L.120 P.46 H.78",
    "1CNCMOCE005": "Comò 3 Cassetti Nettuno - Grigio Cenere - L.120 P.46 H.78",
    "1CNCMOKZ005": "Comò 3 Cassetti Nettuno - Rovere Kadiz PS 60 - L.120 P.46 H.78",
    "1CNCMONG005": "Comò 3 Cassetti Nettuno - Noce Tortora Stelvio - L.120 P.46 H.78",

    # -------------------------------------------------------------------------
    # LETTI E ACCESSORI
    # -------------------------------------------------------------------------

    # Letto da 120 con contenitore
    "1CNLETLW001": "Letto da 120 con Contenitore - Olmo Bianco - L.132 P.213 H.102",
    "1CNLETNS001": "Letto da 120 con Contenitore - Noce Stelvio - L.132 P.213 H.102",
    "1CNLETCE001": "Letto da 120 con Contenitore - Grigio Cenere - L.132 P.213 H.102",
    "1CNLETAT001": "Letto da 120 con Contenitore - Calce - L.132 P.213 H.102",
    "1CNLETPG001": "Letto da 120 con Contenitore - Frassino Ghiaccio - L.132 P.213 H.102",

    # Letto da 120 senza contenitore
    "1CNLETLW002": "Letto da 120 senza Contenitore - Olmo Bianco - L.132 P.213 H.102",
    "1CNLETNS002": "Letto da 120 senza Contenitore - Noce Stelvio - L.132 P.213 H.102",
    "1CNLETCE002": "Letto da 120 senza Contenitore - Grigio Cenere - L.132 P.213 H.102",
    "1CNLETAT002": "Letto da 120 senza Contenitore - Calce - L.132 P.213 H.102",
    "1CNLETPG002": "Letto da 120 senza Contenitore - Frassino Ghiaccio - L.132 P.213 H.102",

    # Letto da 140 senza contenitore
    "1CNLETLW008": "Letto da 140 senza Contenitore - Olmo Bianco - L.152 P.213 H.102",
    "1CNLETNS008": "Letto da 140 senza Contenitore - Noce Stelvio - L.152 P.213 H.102",
    "1CNLETCE008": "Letto da 140 senza Contenitore - Grigio Cenere - L.152 P.213 H.102",
    "1CNLETAT008": "Letto da 140 senza Contenitore - Calce - L.152 P.213 H.102",
    "1CNLETPG008": "Letto da 140 senza Contenitore - Frassino Ghiaccio - L.152 P.213 H.102",

    # Letto da 160 con contenitore
    "1CNLETLW003": "Letto da 160 con Contenitore - Olmo Bianco - L.172 P.213 H.102",
    "1CNLETNS003": "Letto da 160 con Contenitore - Noce Stelvio - L.172 P.213 H.102",
    "1CNLETCE003": "Letto da 160 con Contenitore - Grigio Cenere - L.172 P.213 H.102",
    "1CNLETAT003": "Letto da 160 con Contenitore - Calce - L.172 P.213 H.102",
    "1CNLETPG003": "Letto da 160 con Contenitore - Frassino Ghiaccio - L.172 P.213 H.102",
    "1CNLETKZ003": "Letto da 160 con Contenitore - Rovere Kadiz PS 60 - L.172 P.213 H.102",
    "1CNLETNG003": "Letto da 160 con Contenitore - Noce Tortora Stelvio - L.172 P.213 H.102",

    # Letto da 160 senza contenitore
    "1CNLETLW004": "Letto da 160 senza Contenitore - Olmo Bianco - L.172 P.213 H.102",
    "1CNLETNS004": "Letto da 160 senza Contenitore - Noce Stelvio - L.172 P.213 H.102",
    "1CNLETCE004": "Letto da 160 senza Contenitore - Grigio Cenere - L.172 P.213 H.102",
    "1CNLETAT004": "Letto da 160 senza Contenitore - Calce - L.172 P.213 H.102",
    "1CNLETPG004": "Letto da 160 senza Contenitore - Frassino Ghiaccio - L.172 P.213 H.102",
    "1CNLETKZ004": "Letto da 160 senza Contenitore - Rovere Kadiz PS 60 - L.172 P.213 H.102",
    "1CNLETNG004": "Letto da 160 senza Contenitore - Noce Tortora Stelvio - L.172 P.213 H.102",

    # Accessori letto
    "1CNIMBBI002": "Cuscino in Ecopelle Bianco - per Letto da 120",
    "1CNIMBBI001": "Coppia Cuscini in Ecopelle Bianco - per Letto da 160",
    "1CNIMBCE001": "Coppia Cuscini in Ecopelle Cenere (Art. Silvia 08 - Col 16) - per Letto da 160",

    # -------------------------------------------------------------------------
    # SPECCHIERE
    # -------------------------------------------------------------------------
    "1CNSPEGR001": "Specchiera Rettangolare - 60x90 cm",
    "1CNSPEGR002": "Specchiera Ovale - 120x70 cm",
}


# =============================================================================
# GDOM PRICES - Ares Listino GDOM (AGG. FEBBRAIO 2023)
# Source of truth: Night Supplier Price List in ERPNext
# Used here for validation and gap-filling only.
# =============================================================================

PRICE_LIST_NAME = "Night Supplier Price List"

GDOM_PRICES = {
    "1CNACCAT011": 108.0, "1CNACCAT014": 110.0, "1CNACCCE011": 108.0,
    "1CNACCCE014": 110.0, "1CNACCCE015": 58.0, "1CNACCLW011": 108.0,
    "1CNACCLW014": 110.0, "1CNACCNS011": 108.0, "1CNACCNS014": 110.0,
    "1CNACCPG011": 108.0, "1CNACCPG014": 110.0, "1CNACCTX001": 13.0,
    "1CNACCTX002": 18.0, "1CNACCTX003": 25.0, "1CNACCTX004": 67.0,
    "1CNACCTX005": 60.0, "1CNACCTX006": 72.0, "1CNACCTX007": 59.0,
    "1CNACCTX008": 60.0, "1CNACCTX009": 72.0, "1CNACCTX010": 59.0,
    "1CNACCTX015": 23.0,
    "1CNCMDAT001AT": 60.0, "1CNCMDAT001BL": 64.0, "1CNCMDAT001CE": 60.0,
    "1CNCMDAT002AT": 70.0, "1CNCMDCE001AT": 60.0, "1CNCMDCE001BL": 64.0,
    "1CNCMDCE001CE": 60.0, "1CNCMDCE002CE": 70.0, "1CNCMDCE005": 76.0,
    "1CNCMDKZ002KZ": 70.0, "1CNCMDKZ005": 76.0, "1CNCMDKZ006": 106.0,
    "1CNCMDLW001AT": 60.0, "1CNCMDLW001BL": 64.0, "1CNCMDLW001CE": 60.0,
    "1CNCMDLW001LW": 60.0, "1CNCMDLW002LW": 70.0, "1CNCMDLW005": 76.0,
    "1CNCMDNG002NG": 70.0, "1CNCMDNG005": 76.0, "1CNCMDNS001AT": 60.0,
    "1CNCMDNS001BL": 64.0, "1CNCMDNS001CE": 60.0, "1CNCMDNS001NS": 60.0,
    "1CNCMDNS002NS": 70.0, "1CNCMDNS005": 76.0, "1CNCMDPG001AT": 60.0,
    "1CNCMDPG001BL": 64.0, "1CNCMDPG001CE": 60.0, "1CNCMDPG001PG": 60.0,
    "1CNCMOAT001AT": 174.0, "1CNCMOAT001BL": 184.0, "1CNCMOAT001CE": 174.0,
    "1CNCMOCE001AT": 174.0, "1CNCMOCE001BL": 184.0, "1CNCMOCE001CE": 174.0,
    "1CNCMOCE005": 184.0, "1CNCMOKZ004": 348.0, "1CNCMOKZ005": 184.0,
    "1CNCMOKZ007": 290.0, "1CNCMOLW001AT": 174.0, "1CNCMOLW001BL": 184.0,
    "1CNCMOLW001CE": 174.0, "1CNCMOLW001LW": 174.0, "1CNCMOLW005": 184.0,
    "1CNCMONG005": 184.0, "1CNCMONS001AT": 174.0, "1CNCMONS001BL": 184.0,
    "1CNCMONS001CE": 174.0, "1CNCMONS001NS": 174.0, "1CNCMONS005": 184.0,
    "1CNCMOPG001AT": 174.0, "1CNCMOPG001BL": 184.0, "1CNCMOPG001CE": 174.0,
    "1CNCMOPG001PG": 174.0,
    "1CNFROAT001": 32.0, "1CNFROAT002": 48.0, "1CNFROAT003": 32.0,
    "1CNFROAT004": 48.0, "1CNFROAT005": 64.0, "1CNFROAT006": 316.0,
    "1CNFROAT007": 198.0, "1CNFROAT008": 286.0, "1CNFROAT009": 228.0,
    "1CNFROBL001": 44.0, "1CNFROBL002": 70.0, "1CNFROBL003": 44.0,
    "1CNFROBL004": 70.0, "1CNFROBL005": 90.0, "1CNFROBL006": 342.0,
    "1CNFROBL007": 222.0, "1CNFROBL008": 314.0, "1CNFROBL009": 252.0,
    "1CNFROBR012": 458.0, "1CNFROCE001": 32.0, "1CNFROCE002": 48.0,
    "1CNFROCE003": 32.0, "1CNFROCE004": 48.0, "1CNFROCE005": 64.0,
    "1CNFROCE006": 316.0, "1CNFROCE007": 198.0, "1CNFROCE008": 286.0,
    "1CNFROCE009": 228.0, "1CNFROCE020": 274.0, "1CNFROCM001": 32.0,
    "1CNFROCM002": 48.0, "1CNFROCM003": 32.0, "1CNFROCM004": 48.0,
    "1CNFROCM005": 64.0, "1CNFROFU011": 458.0, "1CNFROKZ001": 32.0,
    "1CNFROKZ002": 48.0, "1CNFROKZ003": 32.0, "1CNFROKZ004": 48.0,
    "1CNFROKZ005": 64.0, "1CNFROKZ006": 316.0, "1CNFROKZ007": 198.0,
    "1CNFROKZ008": 286.0, "1CNFROKZ009": 228.0, "1CNFROKZ020": 274.0,
    "1CNFROLW001": 32.0, "1CNFROLW002": 48.0, "1CNFROLW003": 32.0,
    "1CNFROLW004": 48.0, "1CNFROLW005": 64.0, "1CNFROLW006": 316.0,
    "1CNFROLW007": 198.0, "1CNFROLW008": 286.0, "1CNFROLW009": 228.0,
    "1CNFROLW020": 274.0, "1CNFRONG001": 32.0, "1CNFRONG002": 48.0,
    "1CNFRONG003": 32.0, "1CNFRONG004": 48.0, "1CNFRONG005": 64.0,
    "1CNFRONG020": 274.0, "1CNFRONS001": 32.0, "1CNFRONS002": 48.0,
    "1CNFRONS003": 32.0, "1CNFRONS004": 48.0, "1CNFRONS005": 64.0,
    "1CNFRONS006": 316.0, "1CNFRONS007": 198.0, "1CNFRONS008": 286.0,
    "1CNFRONS009": 228.0, "1CNFRONS020": 274.0, "1CNFROOS001": 32.0,
    "1CNFROOS002": 48.0, "1CNFROOS003": 32.0, "1CNFROOS004": 48.0,
    "1CNFROOS005": 64.0, "1CNFROPD001": 32.0, "1CNFROPD002": 48.0,
    "1CNFROPD003": 32.0, "1CNFROPD004": 48.0, "1CNFROPD005": 64.0,
    "1CNFROPD006": 316.0, "1CNFROPD007": 198.0, "1CNFROPD008": 286.0,
    "1CNFROPD009": 228.0, "1CNFROPG001": 32.0, "1CNFROPG002": 48.0,
    "1CNFROPG003": 32.0, "1CNFROPG004": 48.0, "1CNFROPG005": 64.0,
    "1CNFROPG006": 316.0, "1CNFROPG007": 198.0, "1CNFROPG008": 286.0,
    "1CNFROPG009": 228.0, "1CNFROSP001": 50.0, "1CNFROSP002": 98.0,
    "1CNLETAT001": 244.0, "1CNLETAT002": 114.0, "1CNLETAT003": 254.0,
    "1CNLETAT004": 128.0, "1CNLETAT008": 128.0, "1CNLETCE001": 244.0,
    "1CNLETCE002": 114.0, "1CNLETCE003": 254.0, "1CNLETCE004": 128.0,
    "1CNLETCE008": 128.0, "1CNLETKZ003": 254.0, "1CNLETKZ004": 128.0,
    "1CNLETLW001": 244.0, "1CNLETLW002": 114.0, "1CNLETLW003": 254.0,
    "1CNLETLW004": 128.0, "1CNLETLW008": 128.0, "1CNLETNG003": 254.0,
    "1CNLETNG004": 128.0, "1CNLETNS001": 244.0, "1CNLETNS002": 114.0,
    "1CNLETNS003": 254.0, "1CNLETNS004": 128.0, "1CNLETNS008": 128.0,
    "1CNLETPG001": 244.0, "1CNLETPG002": 114.0, "1CNLETPG003": 254.0,
    "1CNLETPG004": 128.0, "1CNLETPG008": 128.0,
    "1CNMANAT001": 10.0, "1CNMANAT004": 24.0, "1CNMANCE001": 10.0,
    "1CNMANCE004": 24.0, "1CNMANCE007": 32.0, "1CNMANCE010": 70.0,
    "1CNMANKZ001": 10.0, "1CNMANKZ004": 24.0, "1CNMANKZ010": 70.0,
    "1CNMANLW001": 10.0, "1CNMANLW004": 24.0, "1CNMANLW010": 70.0,
    "1CNMANNG001": 10.0, "1CNMANNG004": 24.0, "1CNMANNG010": 70.0,
    "1CNMANNS001": 10.0, "1CNMANNS004": 24.0, "1CNMANNS010": 70.0,
    "1CNMANPD001": 10.0, "1CNMANPD004": 24.0, "1CNMANPG001": 10.0,
    "1CNMANPG004": 24.0,
    "1CNPENAT001AT": 54.0, "1CNPENCE001CE": 54.0, "1CNPENKZ001KZ": 54.0,
    "1CNPENLW001LW": 54.0, "1CNPENNG001NG": 54.0, "1CNPENNS001NS": 54.0,
    "1CNPENPG001PG": 54.0,
    "1CNSETAT001AT": 148.0, "1CNSETAT001BL": 156.0, "1CNSETAT001CE": 148.0,
    "1CNSETCE001AT": 148.0, "1CNSETCE001BL": 156.0, "1CNSETCE001CE": 148.0,
    "1CNSETCE005": 232.0, "1CNSETKZ004": 360.0, "1CNSETKZ005": 232.0,
    "1CNSETLW001AT": 148.0, "1CNSETLW001BL": 156.0, "1CNSETLW001CE": 148.0,
    "1CNSETLW001LW": 148.0, "1CNSETLW005": 232.0, "1CNSETNG005": 232.0,
    "1CNSETNS001AT": 148.0, "1CNSETNS001BL": 156.0, "1CNSETNS001CE": 148.0,
    "1CNSETNS001NS": 148.0, "1CNSETNS005": 232.0, "1CNSETPG001AT": 148.0,
    "1CNSETPG001BL": 156.0, "1CNSETPG001CE": 148.0, "1CNSETPG001PG": 148.0,
    "1CNACCXX012": 34.0, "1CNACCXX014": 48.0,
    "1CNIMBBI001": 47.0, "1CNIMBBI002": 43.0, "1CNIMBCE001": 47.0,
    "1CNSPEGR001": 35.0, "1CNSPEGR002": 64.0,
    "1CNSTRAT001": 90.0, "1CNSTRAT002": 110.0, "1CNSTRAT003": 170.0,
    "1CNSTRAT004": 190.0, "1CNSTRAT005": 240.0, "1CNSTRAT006": 252.0,
    "1CNSTRAT007": 194.0, "1CNSTRAT008": 244.0, "1CNSTRAT009": 116.0,
    "1CNSTRAT010": 116.0, "1CNSTRAT011": 354.0, "1CNSTRAT012": 394.0,
    "1CNSTRAT013": 276.0, "1CNSTRAT014": 54.0, "1CNSTRAT015": 64.0,
    "1CNSTRAT016": 80.0, "1CNSTRAT017": 130.0, "1CNSTRAT018": 186.0,
    "1CNSTRAT019": 262.0, "1CNSTRAT021": 38.0, "1CNSTRCE001": 90.0, "1CNSTRCE002": 110.0,
    "1CNSTRCE003": 170.0, "1CNSTRCE004": 190.0, "1CNSTRCE005": 240.0,
    "1CNSTRCE006": 252.0, "1CNSTRCE007": 194.0, "1CNSTRCE008": 244.0,
    "1CNSTRCE009": 116.0, "1CNSTRCE010": 116.0, "1CNSTRCE011": 354.0,
    "1CNSTRCE012": 394.0, "1CNSTRCE013": 276.0, "1CNSTRCE014": 54.0,
    "1CNSTRCE015": 64.0, "1CNSTRCE016": 80.0, "1CNSTRCE017": 130.0,
    "1CNSTRCE019": 432.0, "1CNSTRCE020": 262.0, "1CNSTRCE021": 38.0,
    "1CNSTRKZ001": 90.0, "1CNSTRKZ002": 110.0, "1CNSTRKZ003": 170.0,
    "1CNSTRKZ004": 190.0, "1CNSTRKZ005": 240.0, "1CNSTRKZ006": 252.0,
    "1CNSTRKZ007": 194.0, "1CNSTRKZ008": 244.0, "1CNSTRKZ009": 116.0,
    "1CNSTRKZ010": 116.0, "1CNSTRKZ011": 354.0, "1CNSTRKZ012": 394.0,
    "1CNSTRKZ013": 276.0, "1CNSTRKZ014": 54.0, "1CNSTRKZ015": 64.0,
    "1CNSTRKZ018": 186.0, "1CNSTRKZ019": 262.0, "1CNSTRKZ020": 432.0, "1CNSTRKZ021": 38.0,
    "1CNSTRLW001": 90.0, "1CNSTRLW002": 110.0, "1CNSTRLW003": 170.0,
    "1CNSTRLW004": 190.0, "1CNSTRLW005": 240.0, "1CNSTRLW006": 252.0,
    "1CNSTRLW007": 194.0, "1CNSTRLW008": 244.0, "1CNSTRLW009": 116.0,
    "1CNSTRLW010": 116.0, "1CNSTRLW011": 354.0, "1CNSTRLW012": 394.0,
    "1CNSTRLW013": 276.0, "1CNSTRLW014": 54.0, "1CNSTRLW015": 64.0,
    "1CNSTRLW016": 80.0, "1CNSTRLW017": 130.0, "1CNSTRLW018": 186.0, "1CNSTRLW019": 432.0,
    "1CNSTRLW020": 262.0, "1CNSTRLW021": 38.0, "1CNSTRNG001": 90.0,
    "1CNSTRNG002": 110.0, "1CNSTRNG003": 170.0, "1CNSTRNG004": 190.0,
    "1CNSTRNG005": 240.0, "1CNSTRNG006": 252.0, "1CNSTRNG007": 194.0,
    "1CNSTRNG008": 244.0, "1CNSTRNG009": 116.0, "1CNSTRNG010": 116.0,
    "1CNSTRNG011": 354.0, "1CNSTRNG012": 394.0, "1CNSTRNG014": 54.0,
    "1CNSTRNG015": 64.0, "1CNSTRNG018": 186.0, "1CNSTRNG020": 432.0, "1CNSTRNG021": 38.0,
    "1CNSTRNS001": 90.0, "1CNSTRNS002": 110.0, "1CNSTRNS003": 170.0,
    "1CNSTRNS004": 190.0, "1CNSTRNS005": 240.0, "1CNSTRNS006": 252.0,
    "1CNSTRNS007": 194.0, "1CNSTRNS008": 244.0, "1CNSTRNS009": 116.0,
    "1CNSTRNS010": 116.0, "1CNSTRNS011": 354.0, "1CNSTRNS012": 394.0,
    "1CNSTRNS013": 276.0, "1CNSTRNS014": 54.0, "1CNSTRNS015": 64.0,
    "1CNSTRNS016": 80.0, "1CNSTRNS017": 130.0, "1CNSTRNS018": 186.0, "1CNSTRNS019": 262.0,
    "1CNSTRNS020": 432.0, "1CNSTRNS021": 38.0, "1CNSTRPD001": 90.0,
    "1CNSTRPD002": 110.0, "1CNSTRPD003": 170.0, "1CNSTRPD004": 190.0,
    "1CNSTRPD005": 240.0, "1CNSTRPD006": 252.0, "1CNSTRPD007": 194.0,
    "1CNSTRPD008": 244.0, "1CNSTRPD009": 116.0, "1CNSTRPD010": 116.0,
    "1CNSTRPD011": 354.0, "1CNSTRPD012": 394.0, "1CNSTRPD013": 276.0,
    "1CNSTRPD019": 262.0, "1CNSTRPD020": 432.0, "1CNSTRPG001": 90.0,
    "1CNSTRPG002": 110.0, "1CNSTRPG003": 170.0, "1CNSTRPG004": 190.0,
    "1CNSTRPG005": 240.0, "1CNSTRPG006": 252.0, "1CNSTRPG007": 194.0,
    "1CNSTRPG008": 244.0, "1CNSTRPG009": 116.0, "1CNSTRPG010": 116.0,
    "1CNSTRPG011": 354.0, "1CNSTRPG012": 394.0, "1CNSTRPG013": 276.0,
    "1CNSTRPG014": 54.0, "1CNSTRPG015": 64.0, "1CNSTRPG016": 80.0,
    "1CNSTRPG017": 130.0, "1CNSTRPG019": 432.0, "1CNSTRPG020": 262.0,
    "1CNSTRPG021": 38.0, "1CNSTRTX001": 90.0, "1CNSTRTX002": 110.0,
    "1CNSTRTX003": 170.0, "1CNSTRTX004": 190.0, "1CNSTRTX005": 240.0,
    "1CNSTRTX006": 252.0, "1CNSTRTX007": 194.0, "1CNSTRTX008": 244.0,
    "1CNSTRTX009": 116.0, "1CNSTRTX010": 116.0, "1CNSTRTX011": 354.0,
    "1CNSTRTX012": 394.0,
    "1CNSTCTX001": 90.0, "1CNSTCTX002": 110.0, "1CNSTCTX003": 170.0,
    "1CNSTCTX004": 190.0, "1CNSTCTX005": 240.0, "1CNSTCTX006": 252.0,
    "1CNSTCTX007": 194.0, "1CNSTCTX008": 244.0, "1CNSTCTX009": 116.0,
    "1CNSTCTX010": 116.0,
    "1FHTX2000": 165.0, "1FHTX2006": 64.0,
    "1SPTX2117": 67.0, "1SPTX2119": 72.0, "1SPTX2120": 60.0,
    "1SPTX2121": 59.0, "1SPTX2122": 72.0, "1SPTX2123": 60.0,
}


_ITEM_GROUP_MAP = {
    "1CNSTCTX": "WARDROBE_STRUCTURE",
    "1CNSTRLW018": "WARDROBE_STRUCTURE",
    "1CNSTRNS018": "WARDROBE_STRUCTURE",
    "1CNSTRCE018": "WARDROBE_STRUCTURE",
    "1CNSTRAT018": "WARDROBE_STRUCTURE",
    "1CNSTRPG018": "WARDROBE_STRUCTURE",
    "1CNSTRKZ018": "WARDROBE_STRUCTURE",
    "1CNSTRNG018": "WARDROBE_STRUCTURE",
    "1CNACCTX": "INTERNAL_ACCESSORY",
    "1CNACCXX012": "ACCESSORY_LED",
    "1CNACCXX014": "ACCESSORY_STRUCTURE",
    # Under-Ponte Framing Shelf — finish-keyed accessories (1CNACC{FIN}014)
    "1CNACCLW014": "ACCESSORY_STRUCTURE",
    "1CNACCNS014": "ACCESSORY_STRUCTURE",
    "1CNACCCE014": "ACCESSORY_STRUCTURE",
    "1CNACCAT014": "ACCESSORY_STRUCTURE",
    "1CNACCPG014": "ACCESSORY_STRUCTURE",
    "1CNIMBBI": "FURNITURE_BED",
    "1CNIMBCE": "FURNITURE_BED",
}


def _item_group_for(code):
    for prefix, group in _ITEM_GROUP_MAP.items():
        if code.startswith(prefix) or code == prefix:
            return group
    return None


def execute():
    # ------------------------------------------------------------------
    # Counters
    # ------------------------------------------------------------------
    meta_updated = 0
    meta_inserted = 0
    meta_skipped = 0
    price_created = 0
    price_updated = 0
    price_ok = 0
    price_skipped = 0
    errors = []

    items = frappe.get_all(
        "Item",
        filters={"cm_product_type": "Secondary", "disabled": 0},
        fields=["name"]
    )
    existing_codes = {r["name"] for r in items}

    # ------------------------------------------------------------------
    # Pass 1 - Supplier metadata (update existing + insert new)
    # ------------------------------------------------------------------
    for code, italian in GDOM_ITALIAN.items():
        try:
            if frappe.db.exists("Item", code):
                doc = frappe.get_doc("Item", code)

                doc.cm_supplier_name = ARES_SUPPLIER
                doc.cm_supplier_item_code = code
                doc.cm_supplier_item_name = italian

                existing = [r for r in doc.supplier_items if r.supplier == ARES_SUPPLIER]
                if existing:
                    existing[0].supplier_part_no = code
                else:
                    doc.append("supplier_items", {
                        "supplier": ARES_SUPPLIER,
                        "supplier_part_no": code,
                    })

                doc.save(ignore_permissions=True)
                meta_updated += 1

            else:
                item_group = _item_group_for(code)
                if not item_group:
                    meta_skipped += 1
                    errors.append(f"[SKIP] {code}: no item_group mapping, item not created")
                    continue

                frappe.get_doc({
                    "doctype": "Item",
                    "item_code": code,
                    "item_name": italian[:140],
                    "item_group": item_group,
                    "stock_uom": "EA",
                    "is_stock_item": 0,
                    "brand": "Ares Mobilificio",
                    "disabled": 0,
                    "cm_product_type": "Secondary",
                    "cm_supplier_name": ARES_SUPPLIER,
                    "cm_supplier_item_code": code,
                    "cm_supplier_item_name": italian[:140],
                    "supplier_items": [{
                        "supplier": ARES_SUPPLIER,
                        "supplier_part_no": code,
                    }],
                }).insert(ignore_permissions=True)
                meta_inserted += 1

        except Exception as e:
            errors.append(f"[META] {code}: {str(e)}")

    frappe.db.commit()

    # ------------------------------------------------------------------
    # Pass 2 - Price validation / gap-fill against Night Supplier Price List
    # ------------------------------------------------------------------
    for code, listino_price in GDOM_PRICES.items():
        try:
            existing_prices = frappe.get_all(
                "Item Price",
                filters={
                    "item_code": code,
                    "price_list": PRICE_LIST_NAME,
                },
                fields=["name", "price_list_rate"]
            )

            if not existing_prices:
                # Price missing - create it
                frappe.get_doc({
                    "doctype": "Item Price",
                    "item_code": code,
                    "price_list": PRICE_LIST_NAME,
                    "currency": "EUR",
                    "price_list_rate": listino_price,
                    "buying": 1,
                    "selling": 0,
                }).insert(ignore_permissions=True)
                price_created += 1

            else:
                existing_rate = float(existing_prices[0]["price_list_rate"])
                if existing_rate != listino_price:
                    # Price differs from listino - update it
                    price_doc = frappe.get_doc("Item Price", existing_prices[0]["name"])
                    price_doc.price_list_rate = listino_price
                    price_doc.save(ignore_permissions=True)
                    price_updated += 1
                    errors.append(
                        f"[PRICE CORRECTED] {code}: "
                        f"ERPNext had EUR{existing_rate}, listino is EUR{listino_price}"
                    )
                else:
                    price_ok += 1

        except Exception as e:
            errors.append(f"[PRICE] {code}: {str(e)}")
            price_skipped += 1

    frappe.db.commit()

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print(f"\n{'=' * 65}")
    print("  Night Collection - Ares GDOM Listino Import")
    print(f"{'=' * 65}")
    print("\n  SUPPLIER METADATA")
    print(f"    Items inserted  : {meta_inserted}")
    print(f"    Items updated   : {meta_updated}")
    print(f"    Items skipped   : {meta_skipped}  (no item_group mapping)")
    print(f"\n  PRICES  ({PRICE_LIST_NAME})")
    print(f"    Already correct : {price_ok}")
    print(f"    Newly created   : {price_created}")
    print(f"    Corrected       : {price_updated}")
    print(f"    Errors/skipped  : {price_skipped}")
    if errors:
        print(f"\n  NOTES / CORRECTIONS ({len(errors)}):")
        for err in errors:
            print(f"    {err}")
    print(f"{'=' * 65}\n")
