> **Historical record.** Kept for the reasoning; PDFluent is live on the Store
> with the corrected screenshot set. The Dutch text below is pre-#229 debt.

> **OPGELOST 2026-08-22.** Jasper heeft de set opnieuw uit Figma geëxporteerd;
> de canonieke set staat in `~/Documents/PDFluent/assets/store-screenshots/`
> en bevat geen opname met die knop. `listing/PASTE-SHEET.md` wijst er nu naar.
> Hieronder blijft staan waarom het een blokkade was.

# ⛔ Blokkade vóór verzending: `06-sign.png` toont een knop die niet bestaat

Gevonden 2026-08-20.

`listing/PASTE-SHEET.md` regel 97 wijst `screenshots/en/final/06-sign.png` aan
voor upload. Die opname toont een grote blauwe primaire knop **"Invite to sign"**.

Die knop zit niet in de ingezonden build:

| Datum | Wat |
|---|---|
| 2026-07-23 | commit `993990d` — *fix(esign): remove non-functional invitation flow* |
| 2026-07-24 | dossier gericht op **beta.21**, die de fix dus bevat |
| — | screenshot dateert van vóór de verwijdering en is nooit opnieuw gemaakt |

Gecontroleerd in de huidige code: geen `invite` in `src/`, geen i18n-sleutel. Het
paneel heeft `editorV3.esign.addSignature` en `.addInitials`, verder niets.

**Waarom dit telt.** Zowel Microsoft als Apple weigeren inzendingen waarvan de
screenshots de app verkeerd voorstellen. En de knop suggereert dat een document
verstuurd wordt, op een product dat als belofte heeft dat er niets weggaat — dat
is niet alleen een afwijzing waard, het is ook precies de claim die op
pdfluent.com/verify wordt onderbouwd.

## Twee manieren om het op te lossen

1. **Nieuwe opname maken** uit de beta.21-build. Past bij de rest van de map
   (`screenshots/raw/` zijn echte captures) en is het meest eerlijk.
2. **De gecorrigeerde marketingversie gebruiken:**
   `~/Downloads/PDFluent_AppStore_Screenshots/Microsoft Store (1920×1080)/3 Microsoft Store.png`
   — 3840×2160, knop verwijderd op 2026-08-20. Wel een compositie, geen kale
   schermafdruk; controleer of dat past bij wat de rest van de inzending doet.

Verwijder deze notitie zodra `06-sign.png` vervangen is.
