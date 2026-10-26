#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
"""Builds the synthetic, labelled evaluation corpus for personal-data detection.

Everything is made up: names are drawn from lists of common given names and
surnames and combined at random, so no combination refers to a person on
purpose; street names are generic; e-mail addresses sit on reserved domains;
IBANs, card numbers and national identifiers are computed from the public
checksum rules (they pass the checks and belong to nobody on purpose); phone
numbers use random digits. No document, letter or record of a real person is
used or imitated.

The generator is deterministic (fixed seed). Its checksum code is written
separately from the Rust validators on purpose: if the two disagree, the
evaluation shows it.

    python3 generate_corpus.py            # rewrites corpus/<lang>.jsonl
    python3 generate_corpus.py --check    # fails if the files are not what the generator makes

Format (one JSON object per line, see docs/PII_DETECTION_GATE.md):
  {"id", "lang", "text", "entities": [{"type", "start", "end", "text", "subtype"?, "layer"?}]}
"layer": "model" marks an entity no checksum or context rule can prove; the
validator-layer gate does not expect it, the full gate does.
start/end are Unicode scalar (code point) offsets, end exclusive.
"""
import json
import random
import string
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "corpus"
SEED = 20261018
DOCS_PER_LANGUAGE = 80
LANGUAGES = ["en", "nl", "de", "fr", "es", "it"]


# ── checksum helpers (independent of the Rust code) ────────────────────

def luhn_check_digit(body):
    total = 0
    for i, ch in enumerate(reversed(body)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return str((10 - total % 10) % 10)


def iban_from(country, bban):
    rearranged = bban + country + "00"
    num = "".join(str(int(c, 36)) for c in rearranged)
    check = 98 - int(num) % 97
    return f"{country}{check:02d}{bban}"


def group4(s):
    return " ".join(s[i:i + 4] for i in range(0, len(s), 4))


def bsn(rng):
    while True:
        d = [rng.randint(0, 9) for _ in range(8)]
        if d[0] == 0:
            continue
        w = [9, 8, 7, 6, 5, 4, 3, 2]
        s = sum(a * b for a, b in zip(d, w))
        # last digit weight -1: need s - last = 0 mod 11
        last = s % 11
        if last == 10:
            continue
        digits = d + [last]
        if len(set(digits)) < 4:
            continue
        return "".join(map(str, digits))


def steuer_id(rng):
    while True:
        first = [rng.randint(0, 9) for _ in range(10)]
        if first[0] == 0:
            continue
        counts = {x: first.count(x) for x in set(first)}
        rep = [x for x, c in counts.items() if c >= 2]
        if len(rep) != 1 or counts[rep[0]] > 3:
            continue
        if any(first[i] == first[i + 1] == first[i + 2] for i in range(8)):
            continue
        p = 10
        for x in first:
            s = (x + p) % 10
            if s == 0:
                s = 10
            p = (s * 2) % 11
        c = 11 - p
        if c == 10:
            c = 0
        return "".join(map(str, first)) + str(c)


def nir(rng):
    sex = rng.choice("12")
    yy = rng.randint(40, 99)
    mm = rng.randint(1, 12)
    dept = rng.choice(["75", "69", "13", "33", "31", "59", "44", "67", "06", "34", "2A", "2B"])
    commune = rng.randint(1, 999)
    order = rng.randint(1, 999)
    body = f"{sex}{yy:02d}{mm:02d}{dept}{commune:03d}{order:03d}"
    num = body.replace("2A", "19").replace("2B", "18")
    key = 97 - int(num) % 97
    return body, f"{key:02d}"


def nir_text(rng):
    body, key = nir(rng)
    parts = [body[0], body[1:3], body[3:5], body[5:7], body[7:10], body[10:13], key]
    return " ".join(parts) if rng.random() < 0.7 else "".join(parts)


DNI_TABLE = "TRWAGMYFPDXBNJZSQVHLCKE"


def dni(rng):
    if rng.random() < 0.75:
        n = rng.randint(10000000, 99999999)
        return f"{n}{DNI_TABLE[n % 23]}"
    lead = rng.choice("XYZ")
    n = rng.randint(1000000, 9999999)
    full = int(str("XYZ".index(lead)) + str(n))
    return f"{lead}{n}{DNI_TABLE[full % 23]}"


ODD = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23]


def codice_fiscale(rng):
    cons = "BCDFGHJKLMNPQRSTVWXZ"
    base = "".join(rng.choice(cons) + rng.choice(cons) + rng.choice("AEIOU") for _ in range(2))
    year = f"{rng.randint(40, 99):02d}"
    month = rng.choice("ABCDEHLMPRST")
    day = f"{rng.randint(1, 28):02d}"
    town = rng.choice("ABCDEFGH") + f"{rng.randint(1, 999):03d}"
    body = base + year + month + day + town
    total = 0
    for i, ch in enumerate(body):
        v = int(ch) if ch.isdigit() else ord(ch) - 65
        total += ODD[v] if i % 2 == 0 else v
    return body + chr(65 + total % 26)


def nino(rng):
    first = rng.choice("ABCEGHJKLMNPRSTWXYZ")
    second = rng.choice("ABCEGHJKLMNPRSTWXYZ")
    while first + second in {"BG", "GB", "NK", "KN", "TN", "NT", "ZZ"}:
        second = rng.choice("ABCEGHJKLMNPRSTWXYZ")
    digits = "".join(rng.choice(string.digits) for _ in range(6))
    suffix = rng.choice("ABCD")
    if rng.random() < 0.6:
        return f"{first}{second} {digits[0:2]} {digits[2:4]} {digits[4:6]} {suffix}"
    return f"{first}{second}{digits}{suffix}"


def ssn(rng):
    while True:
        a = rng.randint(1, 899)
        if a == 666:
            continue
        return f"{a:03d}-{rng.randint(1, 99):02d}-{rng.randint(1, 9999):04d}"


def card(rng):
    kind = rng.choice(["visa", "mc", "amex"])
    if kind == "visa":
        body = "4" + "".join(rng.choice(string.digits) for _ in range(14))
        num = body + luhn_check_digit(body)
        return group4(num) if rng.random() < 0.7 else num
    if kind == "mc":
        body = str(rng.choice([51, 52, 53, 54, 55])) + "".join(rng.choice(string.digits) for _ in range(13))
        num = body + luhn_check_digit(body)
        return group4(num) if rng.random() < 0.7 else num
    body = rng.choice(["34", "37"]) + "".join(rng.choice(string.digits) for _ in range(12))
    num = body + luhn_check_digit(body)
    return f"{num[:4]} {num[4:10]} {num[10:]}"


def bad_card(rng):
    while True:
        body = "4" + "".join(rng.choice(string.digits) for _ in range(14))
        good = luhn_check_digit(body)
        bad = rng.choice([d for d in string.digits if d != good])
        num = body + bad
        return group4(num)


def rand_digits(rng, n):
    return "".join(rng.choice(string.digits) for _ in range(n))


def no_run(rng, n):
    """Random digits without long runs or an ascending string."""
    while True:
        s = rand_digits(rng, n)
        if any(s[i] == s[i + 1] == s[i + 2] for i in range(n - 2)):
            continue
        return s


def iban(rng, country):
    if country == "NL":
        bban = rng.choice(["ABNA", "INGB", "RABO", "TRIO", "SNSB"]) + rand_digits(rng, 10)
    elif country == "DE":
        bban = rand_digits(rng, 18)
    elif country == "FR":
        bban = rand_digits(rng, 10) + rand_digits(rng, 11) + rand_digits(rng, 2)
    elif country == "GB":
        bban = rng.choice(["NWBK", "BARC", "LOYD", "HBUK"]) + rand_digits(rng, 14)
    elif country == "ES":
        bban = rand_digits(rng, 20)
    elif country == "IT":
        bban = rng.choice(string.ascii_uppercase) + rand_digits(rng, 10) + rand_digits(rng, 12)
    else:
        raise ValueError(country)
    full = iban_from(country, bban)
    return group4(full) if rng.random() < 0.75 else full


def bad_iban(rng, country):
    full = iban(rng, country).replace(" ", "")
    pos = 2
    wrong = rng.choice([d for d in string.digits if d != full[pos]])
    bad = full[:pos] + wrong + full[pos + 1:]
    return group4(bad)


# ── language data ──────────────────────────────────────────────────────

def fold(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower().replace(" ", "")


L = {}

L["en"] = dict(
    inline='You can reach {p} on {phone} or by e-mail at {email}.',
    first=["James", "Emily", "Oliver", "Sophie", "Daniel", "Hannah", "Thomas", "Charlotte", "Michael", "Laura", "Andrew", "Megan"],
    last=["Walker", "Turner", "Bennett", "Fletcher", "Hughes", "Carter", "Murray", "Brooks", "Reed", "Foster", "Powell", "Harper"],
    streets=["Station Road", "Church Lane", "Maple Avenue", "High Street", "Oak Drive", "Park Road", "Mill Street"],
    cities=[("Leeds", "LS1 4AP"), ("Bristol", "BS1 5TR"), ("Manchester", "M2 3WQ"), ("Springfield, IL", "62704"), ("Portland, OR", "97205"), ("Cardiff", "CF10 2EQ")],
    greeting="Dear {p},",
    closing=["Kind regards,", "Yours sincerely,"],
    labels=dict(name="Name", address="Address", phone="Phone", email="Email", iban="IBAN", card="Card number", dob="Date of birth",
                nid_nino="National Insurance number", nid_ssn="SSN"),
    filler=["Thank you for your letter of last week.", "Please find the requested documents attached.", "We will contact you if anything else is needed.",
            "The meeting has been moved to Thursday afternoon.", "Your request is being processed by our team."],
    months=["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    dob_fmt=["{d:02d}/{m:02d}/{y}", "{y}-{m:02d}-{d:02d}", "{d} {mon} {y}", "{mon} {d}, {y}"],
    phone=lambda rng: rng.choice([
        lambda: f"+44 20 7946 0{rand_digits(rng, 3)}",
        lambda: f"07700 900{rand_digits(rng, 3)}",
        lambda: f"+44 7700 900{rand_digits(rng, 3)}",
        lambda: f"+1 202 555 01{rand_digits(rng, 2)}",
    ])(),
    addr=lambda rng, street, n, city: f"{n} {street}, {city[0]} {city[1]}" if "," not in city[0] else f"{n} {street}, {city[0]} {city[1]}",
    ibancc="GB",
    distract=["Invoice INV-2024-00417 is due on 18/10/2024.", "Order 4821937 shipped on 03/11/2024.", "Total: GBP 1,234.56 including VAT.",
              "Reference 123456789 (not a national number).", "Version 2.4.1 of the handbook applies."],
)

L["nl"] = dict(
    inline='U kunt {p} bereiken op {phone} of via {email}.',
    first=["Jan", "Sanne", "Pieter", "Lotte", "Willem", "Femke", "Daan", "Anouk", "Joost", "Marieke", "Bram", "Eva"],
    last=["de Vries", "Jansen", "van Dijk", "Bakker", "Visser", "Smit", "Meijer", "de Boer", "Mulder", "Bos", "Vos", "Peters"],
    streets=["Kerkstraat", "Dorpsstraat", "Molenweg", "Hoofdstraat", "Stationsplein", "Julianalaan", "Beatrixlaan"],
    cities=[("Amsterdam", "1011 AB"), ("Utrecht", "3511 CD"), ("Rotterdam", "3011 EF"), ("Groningen", "9711 GH"), ("Eindhoven", "5611 JK"), ("Zwolle", "8011 LM")],
    greeting="Geachte {p},",
    closing=["Met vriendelijke groet,", "Hoogachtend,"],
    labels=dict(name="Naam", address="Adres", phone="Telefoon", email="E-mail", iban="IBAN", card="Creditcard", dob="Geboortedatum", nid_bsn="BSN"),
    filler=["Hartelijk dank voor uw bericht van vorige week.", "In de bijlage vindt u de gevraagde stukken.", "Wij nemen contact met u op als er iets ontbreekt.",
            "De afspraak is verplaatst naar donderdagmiddag.", "Uw aanvraag wordt door ons team behandeld."],
    months=["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
    dob_fmt=["{d}-{m}-{y}", "{d:02d}-{m:02d}-{y}", "{d} {mon} {y}", "{y}-{m:02d}-{d:02d}"],
    phone=lambda rng: rng.choice([
        lambda: f"06 {no_run(rng, 8)}",
        lambda: f"06-{no_run(rng, 8)}",
        lambda: f"+31 6 {no_run(rng, 8)}",
        lambda: f"020 {no_run(rng, 7)}",
        lambda: f"+31 20 {no_run(rng, 7)}",
    ])(),
    addr=lambda rng, street, n, city: f"{street} {n}, {city[1]} {city[0]}",
    ibancc="NL",
    distract=["Factuur 2024-0417 moet voor 18-10-2024 betaald zijn.", "Bestelnummer 4821937 is verzonden op 03-11-2024.", "Totaal: EUR 1.234,56 inclusief btw.",
              "Referentie 123456789 hoort bij het dossier.", "Versie 2.4.1 van het handboek is van toepassing."],
)

L["de"] = dict(
    inline='Sie erreichen {p} unter {phone} oder per E-Mail an {email}.',
    first=["Hans", "Anna", "Lukas", "Julia", "Felix", "Katharina", "Jonas", "Lena", "Markus", "Sabine", "Tobias", "Miriam"],
    last=["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Schäfer", "Koch", "Richter"],
    streets=["Hauptstraße", "Bahnhofstraße", "Gartenweg", "Schulstraße", "Lindenallee", "Bergstraße", "Mühlenweg"],
    cities=[("Berlin", "10115"), ("München", "80331"), ("Hamburg", "20095"), ("Köln", "50667"), ("Leipzig", "04109"), ("Stuttgart", "70173")],
    greeting="Sehr geehrte(r) {p},",
    closing=["Mit freundlichen Grüßen", "Beste Grüße"],
    labels=dict(name="Name", address="Anschrift", phone="Telefon", email="E-Mail", iban="IBAN", card="Kreditkarte", dob="Geburtsdatum", nid_steuer="Steuer-ID"),
    filler=["Vielen Dank für Ihr Schreiben von letzter Woche.", "Die angeforderten Unterlagen finden Sie im Anhang.", "Wir melden uns, falls noch etwas fehlt.",
            "Der Termin wurde auf Donnerstagnachmittag verschoben.", "Ihr Antrag wird von unserem Team bearbeitet."],
    months=["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    dob_fmt=["{d:02d}.{m:02d}.{y}", "{d}.{m}.{y}", "{d}. {mon} {y}", "{y}-{m:02d}-{d:02d}"],
    phone=lambda rng: rng.choice([
        lambda: f"030 {no_run(rng, 8)}",
        lambda: f"+49 30 {no_run(rng, 8)}",
        lambda: f"0171 {no_run(rng, 7)}",
        lambda: f"+49 171 {no_run(rng, 7)}",
        lambda: f"089/{no_run(rng, 7)}",
    ])(),
    addr=lambda rng, street, n, city: f"{street} {n}, {city[1]} {city[0]}",
    ibancc="DE",
    distract=["Rechnung RE-2024-00417 ist bis zum 18.10.2024 fällig.", "Bestellung 4821937 wurde am 03.11.2024 versandt.", "Summe: EUR 1.234,56 inklusive MwSt.",
              "Aktenzeichen 123456789 gehört zum Vorgang.", "Version 2.4.1 des Handbuchs gilt."],
)

L["fr"] = dict(
    inline='Vous pouvez joindre {p} au {phone} ou par courriel à {email}.',
    first=["Pierre", "Marie", "Julien", "Camille", "Nicolas", "Claire", "Antoine", "Élodie", "Thomas", "Isabelle", "Mathieu", "Léa"],
    last=["Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Lefebvre", "Girard", "Rousseau", "Fontaine", "Mercier", "Lambert", "Faure"],
    streets=["rue de la Paix", "avenue des Fleurs", "rue Victor Hugo", "boulevard Voltaire", "rue du Moulin", "place de la Mairie"],
    cities=[("Paris", "75002"), ("Lyon", "69003"), ("Marseille", "13001"), ("Toulouse", "31000"), ("Bordeaux", "33000"), ("Lille", "59000")],
    greeting="Madame, Monsieur {p},",
    closing=["Cordialement,", "Bien à vous,"],
    labels=dict(name="Nom", address="Adresse", phone="Téléphone", email="E-mail", iban="IBAN", card="Carte bancaire", dob="Date de naissance", nid_nir="N° de sécurité sociale"),
    filler=["Merci pour votre courrier de la semaine dernière.", "Vous trouverez les documents demandés en pièce jointe.", "Nous vous contacterons s'il manque quoi que ce soit.",
            "Le rendez-vous a été déplacé à jeudi après-midi.", "Votre demande est en cours de traitement."],
    months=["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    dob_fmt=["{d:02d}/{m:02d}/{y}", "{d} {mon} {y}", "{d:02d}-{m:02d}-{y}"],
    phone=lambda rng: rng.choice([
        lambda: f"0{rng.choice('1234')} {rand_digits(rng, 2)} {rand_digits(rng, 2)} {rand_digits(rng, 2)} {rand_digits(rng, 2)}",
        lambda: f"0{rng.choice('67')} {rand_digits(rng, 2)} {rand_digits(rng, 2)} {rand_digits(rng, 2)} {rand_digits(rng, 2)}",
        lambda: f"+33 {rng.choice('67')} {rand_digits(rng, 2)} {rand_digits(rng, 2)} {rand_digits(rng, 2)} {rand_digits(rng, 2)}",
        lambda: f"+33 1 {rand_digits(rng, 2)} {rand_digits(rng, 2)} {rand_digits(rng, 2)} {rand_digits(rng, 2)}",
    ])(),
    addr=lambda rng, street, n, city: f"{n} {street}, {city[1]} {city[0]}",
    ibancc="FR",
    distract=["La facture FA-2024-00417 est à régler avant le 18/10/2024.", "La commande 4821937 a été expédiée le 03/11/2024.", "Total : 1 234,56 EUR TTC.",
              "La référence 123456789 correspond au dossier.", "La version 2.4.1 du manuel s'applique."],
)

L["es"] = dict(
    inline='Puede contactar con {p} en el {phone} o por correo en {email}.',
    first=["Javier", "Lucía", "Carlos", "María", "Alejandro", "Carmen", "Sergio", "Paula", "Miguel", "Elena", "Pablo", "Marta"],
    last=["García", "Rodríguez", "Martínez", "López", "Sánchez", "Pérez", "Gómez", "Fernández", "Ruiz", "Díaz", "Moreno", "Álvarez"],
    streets=["Calle Mayor", "Avenida de la Constitución", "Calle del Sol", "Paseo de Gracia", "Calle Real", "Plaza de España"],
    cities=[("Madrid", "28013"), ("Barcelona", "08002"), ("Valencia", "46001"), ("Sevilla", "41001"), ("Bilbao", "48001"), ("Zaragoza", "50001")],
    greeting="Estimado/a {p}:",
    closing=["Atentamente,", "Un cordial saludo,"],
    labels=dict(name="Nombre", address="Dirección", phone="Teléfono", email="Correo electrónico", iban="IBAN", card="Tarjeta", dob="Fecha de nacimiento", nid_dni="DNI"),
    filler=["Gracias por su carta de la semana pasada.", "Adjuntamos los documentos solicitados.", "Nos pondremos en contacto si falta algo.",
            "La reunión se ha trasladado al jueves por la tarde.", "Su solicitud está siendo tramitada por nuestro equipo."],
    months=["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    dob_fmt=["{d:02d}/{m:02d}/{y}", "{d} de {mon} de {y}", "{d}-{m}-{y}"],
    phone=lambda rng: rng.choice([
        lambda: f"+34 6{rand_digits(rng, 2)} {rand_digits(rng, 3)} {rand_digits(rng, 3)}",
        lambda: f"+34 91 {rand_digits(rng, 3)} {rand_digits(rng, 2)} {rand_digits(rng, 2)}",
        lambda: f"+34 7{rand_digits(rng, 2)} {rand_digits(rng, 3)} {rand_digits(rng, 3)}",
    ])(),
    addr=lambda rng, street, n, city: f"{street} {n}, {city[1]} {city[0]}",
    ibancc="ES",
    distract=["La factura FA-2024-00417 vence el 18/10/2024.", "El pedido 4821937 se envió el 03/11/2024.", "Total: 1.234,56 EUR IVA incluido.",
              "La referencia 123456789 corresponde al expediente.", "Se aplica la versión 2.4.1 del manual."],
)

L["it"] = dict(
    inline='Può contattare {p} al {phone} o via e-mail a {email}.',
    first=["Marco", "Giulia", "Luca", "Francesca", "Matteo", "Chiara", "Alessandro", "Sara", "Davide", "Elisa", "Andrea", "Valentina"],
    last=["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo"],
    streets=["Via Roma", "Corso Italia", "Via Garibaldi", "Piazza Duomo", "Via Verdi", "Viale Mazzini"],
    cities=[("Roma", "00184"), ("Milano", "20121"), ("Torino", "10121"), ("Napoli", "80133"), ("Bologna", "40121"), ("Firenze", "50122")],
    greeting="Gentile {p},",
    closing=["Cordiali saluti,", "Distinti saluti,"],
    labels=dict(name="Nome", address="Indirizzo", phone="Telefono", email="E-mail", iban="IBAN", card="Carta di credito", dob="Data di nascita", nid_cf="Codice fiscale"),
    filler=["Grazie per la sua lettera della settimana scorsa.", "In allegato trova i documenti richiesti.", "La contatteremo se manca qualcosa.",
            "L'appuntamento è stato spostato a giovedì pomeriggio.", "La sua richiesta è in lavorazione presso il nostro team."],
    months=["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
    dob_fmt=["{d:02d}/{m:02d}/{y}", "{d} {mon} {y}", "{d}-{m}-{y}"],
    phone=lambda rng: rng.choice([
        lambda: f"+39 3{rand_digits(rng, 2)} {rand_digits(rng, 7)}",
        lambda: f"+39 06 {rand_digits(rng, 8)}",
        lambda: f"+39 02 {rand_digits(rng, 8)}",
    ])(),
    addr=lambda rng, street, n, city: f"{street} {n}, {city[1]} {city[0]}",
    ibancc="IT",
    distract=["La fattura FT-2024-00417 scade il 18/10/2024.", "L'ordine 4821937 è stato spedito il 03/11/2024.", "Totale: 1.234,56 EUR IVA inclusa.",
              "Il riferimento 123456789 riguarda la pratica.", "Si applica la versione 2.4.1 del manuale."],
)


# ── document builder ───────────────────────────────────────────────────

class Doc:
    def __init__(self):
        self.text = ""
        self.entities = []

    def add(self, *parts):
        """Parts are plain strings or (type, string[, subtype]) tuples."""
        for p in parts:
            if isinstance(p, str):
                self.text += p
            else:
                typ, s = p[0], p[1]
                ent = {"type": typ, "start": len(self.text), "end": len(self.text) + len(s), "text": s}
                if len(p) > 2:
                    ent["subtype"] = p[2]
                if len(p) > 3:
                    # "model": only the model is expected to find it (no rule can prove it)
                    ent["layer"] = p[3]
                self.entities.append(ent)
                self.text += s

    def line(self, *parts):
        self.add(*parts)
        self.text += "\n"


def make_doc(lang, idx, rng):
    d = L[lang]
    lab = d["labels"]
    doc = Doc()
    person = f"{rng.choice(d['first'])} {rng.choice(d['last'])}"
    doc.line(d["greeting"].split("{p}")[0], ("person", person), d["greeting"].split("{p}")[1])
    doc.line()
    doc.line(rng.choice(d["filler"]))
    if rng.random() < 0.9:
        street = rng.choice(d["streets"])
        city = rng.choice(d["cities"])
        addr = d["addr"](rng, street, rng.randint(1, 199), city)
        doc.line(f"{lab['address']}: ", ("address", addr))
    want_email = rng.random() < 0.75
    want_phone = rng.random() < 0.75
    local = f"{fold(person.split()[0])}.{fold(person.split(' ', 1)[1])}"
    email_text = f"{local}@{rng.choice(['example.com', 'example.org', 'example.net', 'mail.example', 'post.test'])}"
    if want_email and want_phone and rng.random() < 0.3:
        before, rest = d["inline"].split("{p}")
        mid, tail = rest.split("{phone}")
        mid2, end = tail.split("{email}")
        doc.line(before, ("person", person), mid, ("phone", d["phone"](rng)), mid2, ("email", email_text), end)
    else:
        if want_email:
            doc.line(f"{lab['email']}: ", ("email", email_text))
        if want_phone:
            doc.line(f"{lab['phone']}: ", ("phone", d["phone"](rng)))
    if rng.random() < 0.65:
        doc.line(f"{lab['iban']}: ", ("iban", iban(rng, d["ibancc"])))
    if rng.random() < 0.45:
        doc.line(f"{lab['card']}: ", ("credit_card", card(rng)))
    if rng.random() < 0.75:
        # the language's own national identifier, always with its context word
        if lang == "en":
            if rng.random() < 0.5:
                doc.line(f"{lab['nid_nino']}: ", ("national_id", nino(rng), "nino"))
            else:
                doc.line(f"{lab['nid_ssn']}: ", ("national_id", ssn(rng), "ssn"))
        elif lang == "nl":
            if rng.random() < 0.2:
                # no context word: the checksum alone cannot tell it from any 9-digit number
                doc.line("Dossier ", ("national_id", bsn(rng), "bsn", "model"), " is in behandeling.")
            else:
                doc.line(f"{lab['nid_bsn']}: ", ("national_id", bsn(rng), "bsn"))
        elif lang == "de":
            s = steuer_id(rng)
            s = f"{s[:2]} {s[2:5]} {s[5:8]} {s[8:]}" if rng.random() < 0.4 else s
            if rng.random() < 0.2:
                doc.line("Vorgang ", ("national_id", s, "steuer_id", "model"), " wird bearbeitet.")
            else:
                doc.line(f"{lab['nid_steuer']}: ", ("national_id", s, "steuer_id"))
        elif lang == "fr":
            doc.line(f"{lab['nid_nir']} : ", ("national_id", nir_text(rng), "nir"))
        elif lang == "es":
            doc.line(f"{lab['nid_dni']}: ", ("national_id", dni(rng), "dni"))
        elif lang == "it":
            doc.line(f"{lab['nid_cf']}: ", ("national_id", codice_fiscale(rng), "codice_fiscale"))
    if rng.random() < 0.6:
        y, m, day = rng.randint(1945, 2005), rng.randint(1, 12), rng.randint(1, 28)
        fmt = rng.choice(d["dob_fmt"])
        doc.line(f"{lab['dob']}: ", ("date_of_birth", fmt.format(d=day, m=m, y=y, mon=d["months"][m - 1])))
    # a second mention of the person, as in a real letter
    doc.line()
    doc.line(rng.choice(d["filler"]))
    doc.line(rng.choice(d["closing"]))
    doc.line(("person", person))
    # distractors: look-alikes that must NOT be reported
    doc.line()
    for s in rng.sample(d["distract"], 3):
        doc.line(s)
    if rng.random() < 0.5:
        doc.line(f"{lab['card']}: {bad_card(rng)}")
    if rng.random() < 0.5:
        doc.line(f"{lab['iban']}: {bad_iban(rng, d['ibancc'])}")
    if lang == "nl" and rng.random() < 0.5:
        doc.line("BSN: 123456789")
    return {"id": f"{lang}-{idx:03d}", "lang": lang, "text": doc.text, "entities": doc.entities}


def build():
    files = {}
    for lang in LANGUAGES:
        rng = random.Random(f"{SEED}-{lang}")
        rows = [make_doc(lang, i, rng) for i in range(DOCS_PER_LANGUAGE)]
        for r in rows:
            for e in r["entities"]:
                assert r["text"][e["start"]:e["end"]] == e["text"], (r["id"], e)
        files[lang] = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
    return files


def main():
    files = build()
    if "--check" in sys.argv:
        bad = [lang for lang, body in files.items() if not (OUT / f"{lang}.jsonl").exists() or (OUT / f"{lang}.jsonl").read_text(encoding="utf-8") != body]
        if bad:
            print("corpus is not what generate_corpus.py makes:", ", ".join(bad), file=sys.stderr)
            sys.exit(1)
        return
    OUT.mkdir(exist_ok=True)
    for lang, body in files.items():
        (OUT / f"{lang}.jsonl").write_text(body, encoding="utf-8")
    print("wrote", ", ".join(f"{l}.jsonl" for l in files))


if __name__ == "__main__":
    main()
