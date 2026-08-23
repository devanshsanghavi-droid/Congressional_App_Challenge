#!/usr/bin/env python3
"""
Carta golden corpus generator.

Produces print-ready PDFs of realistic California benefit notices, plus a
ground-truth JSON recording every field printed on each one.

ALL DATA IS FICTIONAL. Names, case numbers, addresses, and dollar amounts are
invented. Layouts are plausible reconstructions in the house style of CDSS /
DHCS notices -- they are NOT copies of the official forms and are for testing
an OCR pipeline only.

Usage:  python3 make_corpus.py
Output: corpus/*.pdf  and  corpus/ground_truth.json
"""

import json
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "corpus")
os.makedirs(OUT, exist_ok=True)

W, H = letter
M = 0.75 * inch          # margin
truth = []


# ----------------------------------------------------------------- helpers

class Page:
    """Thin wrapper over a reportlab canvas with a running y cursor."""

    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=letter)
        self.y = H - M

    def font(self, name="Helvetica", size=9.5):
        self.c.setFont(name, size)
        self._size = size
        return self

    def line(self, text, dy=None, name="Helvetica", size=9.5, x=M):
        self.c.setFont(name, size)
        self.c.drawString(x, self.y, text)
        self.y -= dy if dy is not None else size + 3.5
        return self

    def right(self, text, name="Helvetica", size=9.5, dy=0):
        self.c.setFont(name, size)
        self.c.drawRightString(W - M, self.y, text)
        self.y -= dy
        return self

    def gap(self, n=10):
        self.y -= n
        return self

    def rule(self, pad=6, width=0.8):
        """Horizontal rule below the current cursor, with padding either side."""
        self.y -= pad + 4
        self.c.setLineWidth(width)
        self.c.line(M, self.y, W - M, self.y)
        self.y -= pad + 8
        return self

    def box(self, height, pad=8, width=1.2):
        """Draw a full-width box below the cursor and move the cursor inside it.

        Reserves `height` of vertical space: the caller writes lines inside,
        then calls .after_box() to drop the cursor clear of the bottom edge.
        """
        self.y -= 4                       # breathing room above the rule
        top = self.y
        self.c.setLineWidth(width)
        self.c.rect(M, top - height, W - 2 * M, height)
        self._box_bottom = top - height
        self.y = top - pad - 6            # first baseline inside the box
        return self

    def after_box(self, pad=12):
        """Drop the cursor below the last drawn box."""
        self.y = self._box_bottom - pad
        return self

    def wrap(self, text, size=9.5, name="Helvetica", width=None, x=M, lead=None):
        """Naive word wrap."""
        width = width or (W - 2 * M - 4)
        lead = lead or size + 3.5
        self.c.setFont(name, size)
        words, cur = text.split(), ""
        for wd in words:
            trial = (cur + " " + wd).strip()
            if self.c.stringWidth(trial, name, size) <= width:
                cur = trial
            else:
                self.c.drawString(x, self.y, cur)
                self.y -= lead
                cur = wd
        if cur:
            self.c.drawString(x, self.y, cur)
            self.y -= lead
        return self

    def checkbox(self, label, checked=False, size=9.5, x=M):
        s = 8
        self.c.setLineWidth(0.9)
        self.c.rect(x, self.y - 1, s, s)
        if checked:
            self.c.setFont("Helvetica-Bold", 9)
            self.c.drawString(x + 1.4, self.y + 0.4, "X")
        self.c.setFont("Helvetica", size)
        self.c.drawString(x + s + 6, self.y, label)
        self.y -= size + 5
        return self

    def field(self, label, value, labelw=175, size=9.5):
        """Label on the left, value sitting on a ruled line to the right."""
        self.c.setFont("Helvetica", size)
        self.c.drawString(M, self.y, label)
        self.c.setFont("Helvetica-Bold", size)
        self.c.drawString(M + labelw, self.y, value)
        self.c.setLineWidth(0.5)
        # rule sits clearly below the text baseline, not through it
        self.c.line(M + labelw - 4, self.y - 4.5, W - M, self.y - 4.5)
        self.y -= size + 11
        return self

    def save(self):
        self.c.showPage()
        self.c.save()


def header(p, agency, county, form_id, rev):
    p.line("STATE OF CALIFORNIA", name="Helvetica-Bold", size=8.5, dy=11)
    p.line(agency, name="Helvetica-Bold", size=8.5, dy=11)
    p.line(f"{county} COUNTY", size=8.5, dy=0)
    p.right(f"{form_id}  (Rev. {rev})", name="Helvetica-Bold", size=8.5, dy=13)
    p.rule(pad=4)
    return p


def addr_block(p, name, addr, city, case_no, worker, phone):
    """Recipient address left, case metadata right. Both columns are 3 lines."""
    y0 = p.y
    p.c.setFont("Helvetica", 9.5)
    p.c.drawString(M, y0, name)
    p.c.drawString(M, y0 - 12, addr)
    p.c.drawString(M, y0 - 24, city)

    p.c.setFont("Helvetica", 9)
    rx = W - M - 190
    p.c.drawString(rx, y0, f"Case Number:  {case_no}")
    p.c.drawString(rx, y0 - 12, f"Worker ID:  {worker}")
    p.c.drawString(rx, y0 - 24, f"Phone:  {phone}")

    # clear the taller of the two columns, plus breathing room
    p.y = y0 - 24 - 14
    return p


def record(fn, form_id, program, agency, lang, action, fields, note=""):
    truth.append({
        "file": fn, "form_id": form_id, "program": program, "agency": agency,
        "language": lang, "action_type": action, "fields": fields, "note": note,
    })


# ------------------------------------------------------------------ 01 SAR 7

def sar7(fn="01-sar7-en.pdf"):
    p = Page(os.path.join(OUT, fn))
    header(p, "HEALTH AND HUMAN SERVICES AGENCY",
           "SANTA CLARA", "SAR 7", "5/25")
    p.gap(2)
    p.line("SEMI-ANNUAL ELIGIBILITY STATUS REPORT",
           name="Helvetica-Bold", size=13, dy=17)
    p.line("CalFresh / CalWORKs", size=10, dy=14)
    p.rule(pad=3)

    addr_block(p, "MARIA REYES", "1428 STORY ROAD APT 12",
               "SAN JOSE, CA 95122", "01-4472-9931", "SC-2214",
               "(408) 758-3401")
    p.rule(pad=3)

    p.line("YOU MUST COMPLETE, SIGN, AND RETURN THIS FORM.",
           name="Helvetica-Bold", size=10.5, dy=15)

    p.box(46)
    p.line("SUBMIT BY:  SEPTEMBER 5, 2026", name="Helvetica-Bold",
           size=12, dy=16, x=M + 10)
    p.line("Report Month:  AUGUST 2026     Benefit Month:  OCTOBER 2026",
           size=9.5, dy=0, x=M + 10)
    p.after_box()

    p.wrap("If your completed report is not received by the submit date shown "
           "above, your benefits may be delayed, reduced, or discontinued. If "
           "you cannot return the form on time, contact your worker before the "
           "submit date.", size=9.5)
    p.gap(4)
    p.rule(pad=3)

    p.line("SECTION 1 -- INCOME", name="Helvetica-Bold", size=10, dy=14)
    p.checkbox("Did anyone in the home receive income last month?  YES", True)
    p.checkbox("                                                    NO", False)
    p.field("Employer name", "VALLEY FRESH MARKET", labelw=175)
    p.field("Gross income received", "$1,847.20", labelw=175)
    p.gap(2)

    p.line("SECTION 2 -- HOUSEHOLD CHANGES", name="Helvetica-Bold", size=10, dy=14)
    p.checkbox("Did anyone move in or out of your home?  NO", True)
    p.checkbox("Did your address change?  NO", True)
    p.gap(2)

    p.line("SECTION 3 -- PROOF YOU MUST SEND", name="Helvetica-Bold", size=10, dy=14)
    p.line("Attach copies. Do not send originals.", size=9, dy=13)
    p.checkbox("All paycheck stubs received last month", False)
    p.checkbox("Current rent receipt or lease agreement", False)
    p.checkbox("Most recent utility bill", False)
    p.gap(6)

    p.rule(pad=3)
    p.field("Signature", "", labelw=110)
    p.field("Date", "", labelw=110)
    p.gap(4)
    p.line("Questions? Call (408) 758-3401.  Se habla espanol.", size=8.5, dy=11)
    p.line("SAR 7 (Rev. 5/25) REQUIRED FORM - SUBSTITUTES PERMITTED", size=7.5)
    p.save()

    record(fn, "SAR 7", "CalFresh/CalWORKs", "Santa Clara County HHSA", "en",
           "recert_due", {
               "recipient_name": "MARIA REYES",
               "case_number": "01-4472-9931",
               "deadline_date": "2026-09-05",
               "report_month": "AUGUST 2026",
               "benefit_month": "OCTOBER 2026",
               "employer": "VALLEY FRESH MARKET",
               "gross_income": "1847.20",
               "worker_id": "SC-2214",
               "required_docs": ["pay_stub", "lease_or_rent_receipt", "utility_bill"],
           })


# --------------------------------------------------------- 02 NA 960X denial

def na960x(fn="02-na960x-discontinuance-en.pdf"):
    p = Page(os.path.join(OUT, fn))
    header(p, "DEPARTMENT OF SOCIAL SERVICES", "SANTA CLARA",
           "NA 960X SAR", "10/24")
    p.gap(2)
    p.line("NOTICE OF ACTION", name="Helvetica-Bold", size=14, dy=18)
    p.line("CalFresh -- Discontinuance", size=10.5, dy=13)
    p.rule(pad=3)

    addr_block(p, "MARIA REYES", "1428 STORY ROAD APT 12",
               "SAN JOSE, CA 95122", "01-4472-9931", "SC-2214",
               "(408) 758-3401")

    p.field("Notice Date", "SEPTEMBER 8, 2026", labelw=150)
    p.field("Effective Date", "SEPTEMBER 30, 2026", labelw=150)
    p.gap(2)

    p.box(40)
    p.line("YOUR CALFRESH BENEFITS WILL STOP ON SEPTEMBER 30, 2026.",
           name="Helvetica-Bold", size=11, dy=0, x=M + 10)
    p.after_box()

    p.line("REASON FOR THIS ACTION", name="Helvetica-Bold", size=10, dy=14)
    p.wrap("We did not receive your Semi-Annual Eligibility Status Report "
           "(SAR 7) that was due on September 5, 2026. Because the report was "
           "not returned, we cannot determine whether your household remains "
           "eligible. Regulation: MPP 63-508.")
    p.gap(4)

    p.line("WHAT YOU CAN DO", name="Helvetica-Bold", size=10, dy=14)
    p.wrap("If you return the completed SAR 7 with all required proof before "
           "September 30, 2026, your benefits may continue without a new "
           "application.")
    p.gap(4)
    p.rule(pad=3)

    p.line("YOUR HEARING RIGHTS", name="Helvetica-Bold", size=10, dy=14)
    p.wrap("If you think this action is wrong, you may ask for a state hearing. "
           "You must ask within 90 days of the date of this notice.")
    p.gap(2)

    p.box(52)
    p.wrap("IMPORTANT: If you ask for a hearing before September 18, 2026, your "
           "benefits may continue at the same level until the hearing decision "
           "is made. This is called aid paid pending.",
           size=9.5, x=M + 10, width=W - 2 * M - 24)
    p.after_box()

    p.line("To ask for a hearing, call 1-800-743-8525 or write to:", size=9.5, dy=13)
    p.line("California Department of Social Services, State Hearings Division",
           size=9.5, dy=12)
    p.line("P.O. Box 944243, MS 09-17-37, Sacramento, CA 94244-2430", size=9.5, dy=14)
    p.line("NA 960X SAR (10/24)", size=7.5)
    p.save()

    record(fn, "NA 960X SAR", "CalFresh", "Santa Clara County DSS", "en",
           "discontinuance", {
               "recipient_name": "MARIA REYES",
               "case_number": "01-4472-9931",
               "notice_date": "2026-09-08",
               "effective_date": "2026-09-30",
               "deadline_date": "2026-09-30",
               "appeal_deadline": "2026-12-07",
               "aid_paid_pending_deadline": "2026-09-18",
               "reason": "SAR 7 not returned",
               "citation": "MPP 63-508",
           }, note="Chains from notice 01 -- same case, missed SAR 7. Notice date is 3 days AFTER the 2026-09-05 SAR 7 deadline, so the chronology holds.")


# ------------------------------------------------------- 03 CF 377.6 verify

def cf3776(fn="03-cf377-6-verification-en.pdf"):
    p = Page(os.path.join(OUT, fn))
    header(p, "DEPARTMENT OF SOCIAL SERVICES", "SANTA CLARA",
           "CF 377.6", "3/24")
    p.gap(2)
    p.line("INFORMATION / VERIFICATION NEEDED",
           name="Helvetica-Bold", size=13, dy=17)
    p.line("CalFresh", size=10, dy=13)
    p.rule(pad=3)

    addr_block(p, "DAVID OKONKWO", "877 N WINCHESTER BLVD APT 4B",
               "SANTA CLARA, CA 95050", "01-8813-2205", "SC-1187",
               "(408) 758-3401")

    p.field("Notice Date", "SEPTEMBER 14, 2026", labelw=150)
    p.gap(2)

    p.box(38)
    p.line("SEND THESE ITEMS BY:  SEPTEMBER 28, 2026",
           name="Helvetica-Bold", size=12, dy=0, x=M + 10)
    p.after_box()

    p.wrap("We need more information before we can finish working on your "
           "CalFresh case. Please send copies of the items checked below.")
    p.gap(6)

    p.line("ITEMS NEEDED", name="Helvetica-Bold", size=10, dy=14)
    p.checkbox("Proof of earned income -- all pay stubs from the last 30 days", True)
    p.checkbox("Proof of housing cost -- lease, rent receipt, or mortgage statement", True)
    p.checkbox("Proof of identity -- driver license, state ID, or passport", True)
    p.checkbox("Proof of utility costs -- gas, electric, or phone bill", True)
    p.checkbox("Proof of child care costs", False)
    p.checkbox("Proof of medical expenses (if age 60+ or disabled)", False)
    p.gap(6)

    p.rule(pad=3)
    p.wrap("IF WE DO NOT RECEIVE THESE ITEMS BY SEPTEMBER 28, 2026, YOUR "
           "CALFRESH BENEFITS MAY BE DENIED OR STOPPED.",
           name="Helvetica-Bold", size=10)
    p.gap(6)
    p.wrap("You may bring items to any county office, mail them to the address "
           "above, or upload them at www.benefitscal.com. If you need help "
           "getting these items, call your worker.")
    p.gap(8)
    p.line("CF 377.6 (3/24)", size=7.5)
    p.save()

    record(fn, "CF 377.6", "CalFresh", "Santa Clara County DSS", "en",
           "info_request", {
               "recipient_name": "DAVID OKONKWO",
               "case_number": "01-8813-2205",
               "notice_date": "2026-09-14",
               "deadline_date": "2026-09-28",
               "required_docs": ["pay_stub", "lease_or_rent_receipt",
                                 "photo_id", "utility_bill"],
           })


# ----------------------------------------------------- 04 MC 210 RV Medi-Cal

def mc210rv(fn="04-mc210rv-redetermination-en.pdf"):
    p = Page(os.path.join(OUT, fn))
    header(p, "DEPARTMENT OF HEALTH CARE SERVICES", "SANTA CLARA",
           "MC 210 RV", "10/24")
    p.gap(2)
    p.line("MEDI-CAL ANNUAL REDETERMINATION",
           name="Helvetica-Bold", size=13, dy=17)
    p.line("Keep your health coverage -- action required", size=10, dy=13)
    p.rule(pad=3)

    addr_block(p, "ANH TRAN", "2255 LANDESS AVE APT 217",
               "MILPITAS, CA 95035", "40-2291-7734", "MC-0442",
               "(408) 755-7100")

    p.field("Notice Date", "SEPTEMBER 1, 2026", labelw=150)
    p.field("Coverage Ends Without Action", "OCTOBER 31, 2026", labelw=210)
    p.gap(2)

    p.box(40)
    p.line("RETURN THIS FORM BY:  OCTOBER 15, 2026",
           name="Helvetica-Bold", size=12, dy=0, x=M + 10)
    p.after_box()

    p.wrap("It is time to renew your Medi-Cal. We need to check whether you "
           "still qualify. If we do not hear from you by October 15, 2026, "
           "your Medi-Cal coverage will end on October 31, 2026.")
    p.gap(6)

    p.line("SECTION A -- HOUSEHOLD", name="Helvetica-Bold", size=10, dy=14)
    p.field("Number of people in household", "3", labelw=230)
    p.field("Any changes since last year?", "NO", labelw=230)
    p.gap(2)

    p.line("SECTION B -- INCOME", name="Helvetica-Bold", size=10, dy=14)
    p.field("Monthly income before taxes", "$2,610.00", labelw=230)
    p.field("Source of income", "EMPLOYMENT", labelw=230)
    p.gap(2)

    p.line("SECTION C -- PROOF TO INCLUDE", name="Helvetica-Bold", size=10, dy=14)
    p.checkbox("Pay stubs from the last 30 days", False)
    p.checkbox("Proof of California residency", False)
    p.gap(6)
    p.rule(pad=3)
    p.wrap("You can renew online at www.benefitscal.com, by phone at "
           "(408) 755-7100, or by mailing this form back.")
    p.gap(6)
    p.line("MC 210 RV (10/24) -- Medi-Cal Annual Redetermination", size=7.5)
    p.save()

    record(fn, "MC 210 RV", "Medi-Cal", "DHCS / Santa Clara County", "en",
           "recert_due", {
               "recipient_name": "ANH TRAN",
               "case_number": "40-2291-7734",
               "notice_date": "2026-09-01",
               "deadline_date": "2026-10-15",
               "effective_date": "2026-10-31",
               "household_size": "3",
               "monthly_income": "2610.00",
               "required_docs": ["pay_stub", "proof_of_residency"],
           })


# --------------------------------------------------- 05 NA 960Y reduction

def na960y(fn="05-na960y-reduction-en.pdf"):
    p = Page(os.path.join(OUT, fn))
    header(p, "DEPARTMENT OF SOCIAL SERVICES", "SANTA CLARA",
           "NA 960Y SAR", "10/24")
    p.gap(2)
    p.line("NOTICE OF ACTION", name="Helvetica-Bold", size=14, dy=18)
    p.line("CalFresh -- Change in Benefit Amount", size=10.5, dy=13)
    p.rule(pad=3)

    addr_block(p, "ROSA MARTINEZ CRUZ", "3390 SENTER RD SPC 88",
               "SAN JOSE, CA 95111", "01-6620-4418", "SC-3390",
               "(408) 758-3401")

    p.field("Notice Date", "SEPTEMBER 18, 2026", labelw=150)
    p.field("Effective Date", "OCTOBER 1, 2026", labelw=150)
    p.gap(4)

    p.box(56)
    p.line("YOUR CALFRESH BENEFITS WILL CHANGE ON OCTOBER 1, 2026.",
           name="Helvetica-Bold", size=11, dy=15, x=M + 10)
    p.line("Current monthly benefit:   $535.00", size=10.5, dy=13, x=M + 10)
    p.line("New monthly benefit:       $291.00", name="Helvetica-Bold",
           size=10.5, dy=0, x=M + 10)
    p.after_box()

    p.line("WHY YOUR BENEFITS CHANGED", name="Helvetica-Bold", size=10, dy=14)
    p.wrap("You reported new earned income of $1,240.00 per month from "
           "SOUTH BAY HOME CARE on your SAR 7. We counted this income and "
           "recalculated your household's benefit. Regulation: MPP 63-503.")
    p.gap(6)

    p.line("YOUR HEARING RIGHTS", name="Helvetica-Bold", size=10, dy=14)
    p.wrap("You may ask for a state hearing within 90 days of the date of "
           "this notice. If you ask for a hearing before September 28, 2026, "
           "your benefits may stay at the current amount until a decision is "
           "made.")
    p.gap(6)
    p.line("To ask for a hearing, call 1-800-743-8525.", size=9.5, dy=14)
    p.line("NA 960Y SAR (10/24)", size=7.5)
    p.save()

    record(fn, "NA 960Y SAR", "CalFresh", "Santa Clara County DSS", "en",
           "reduction", {
               "recipient_name": "ROSA MARTINEZ CRUZ",
               "case_number": "01-6620-4418",
               "notice_date": "2026-09-18",
               "effective_date": "2026-10-01",
               "appeal_deadline": "2026-12-17",
               "aid_paid_pending_deadline": "2026-09-28",
               "old_amount": "535.00",
               "new_amount": "291.00",
               "citation": "MPP 63-503",
           })


# ------------------------------------------------------ 06 SAR 7 (Spanish)

def sar7_es(fn="06-sar7-es.pdf"):
    p = Page(os.path.join(OUT, fn))
    header(p, "AGENCIA DE SALUD Y SERVICIOS HUMANOS",
           "SANTA CLARA", "SAR 7", "5/25")
    p.gap(2)
    p.line("INFORME SEMESTRAL DE ELEGIBILIDAD",
           name="Helvetica-Bold", size=13, dy=17)
    p.line("CalFresh / CalWORKs", size=10, dy=14)
    p.rule(pad=3)

    addr_block(p, "CARMEN DELGADO", "1902 ALUM ROCK AVE APT 7",
               "SAN JOSE, CA 95116", "01-5538-7742", "SC-4471",
               "(408) 758-3401")
    p.rule(pad=3)

    p.line("DEBE COMPLETAR, FIRMAR Y DEVOLVER ESTE FORMULARIO.",
           name="Helvetica-Bold", size=10.5, dy=15)

    p.box(46)
    p.line("FECHA LIMITE:  5 DE SEPTIEMBRE DE 2026",
           name="Helvetica-Bold", size=12, dy=16, x=M + 10)
    p.line("Mes del informe: AGOSTO 2026    Mes de beneficios: OCTUBRE 2026",
           size=9.5, dy=0, x=M + 10)
    p.after_box()

    p.wrap("Si no recibimos su informe completo antes de la fecha limite, sus "
           "beneficios pueden ser retrasados, reducidos o suspendidos. Si no "
           "puede devolver el formulario a tiempo, comuniquese con su "
           "trabajador antes de la fecha limite.")
    p.gap(4)
    p.rule(pad=3)

    p.line("SECCION 1 -- INGRESOS", name="Helvetica-Bold", size=10, dy=14)
    p.checkbox("Recibio alguien ingresos el mes pasado?  SI", True)
    p.field("Nombre del empleador", "PANADERIA LA ESPERANZA", labelw=185)
    p.field("Ingreso bruto recibido", "$1,392.50", labelw=185)
    p.gap(2)

    p.line("SECCION 2 -- CAMBIOS EN EL HOGAR", name="Helvetica-Bold", size=10, dy=14)
    p.checkbox("Se mudo alguien a su casa o salio de ella?  NO", True)
    p.gap(2)

    p.line("SECCION 3 -- PRUEBAS QUE DEBE ENVIAR", name="Helvetica-Bold", size=10, dy=14)
    p.checkbox("Todos los talones de pago del mes pasado", False)
    p.checkbox("Recibo de renta o contrato de arrendamiento", False)
    p.gap(8)
    p.rule(pad=3)
    p.field("Firma", "", labelw=110)
    p.field("Fecha", "", labelw=110)
    p.gap(4)
    p.line("Preguntas? Llame al (408) 758-3401.", size=8.5, dy=11)
    p.line("SAR 7 (Rev. 5/25) SPANISH", size=7.5)
    p.save()

    record(fn, "SAR 7", "CalFresh/CalWORKs", "Santa Clara County HHSA", "es",
           "recert_due", {
               "recipient_name": "CARMEN DELGADO",
               "case_number": "01-5538-7742",
               "deadline_date": "2026-09-05",
               "employer": "PANADERIA LA ESPERANZA",
               "gross_income": "1392.50",
               "required_docs": ["pay_stub", "lease_or_rent_receipt"],
           })


# ------------------------------------------------ 07 bilingual on one sheet

def bilingual(fn="07-na960x-bilingual.pdf"):
    p = Page(os.path.join(OUT, fn))
    header(p, "DEPARTMENT OF SOCIAL SERVICES / DEPARTAMENTO DE SERVICIOS SOCIALES",
           "SANTA CLARA", "NA 960X SAR", "10/24")
    p.gap(2)
    p.line("NOTICE OF ACTION / AVISO DE ACCION",
           name="Helvetica-Bold", size=13, dy=17)
    p.rule(pad=3)

    addr_block(p, "JOSE RAMIREZ", "540 E JULIAN ST APT 3",
               "SAN JOSE, CA 95112", "01-9917-3320", "SC-5510",
               "(408) 758-3401")

    p.field("Notice Date / Fecha del Aviso", "OCTOBER 2, 2026", labelw=210)
    p.gap(2)

    p.box(34)
    p.line("YOUR CALFRESH WILL STOP ON NOVEMBER 1, 2026.",
           name="Helvetica-Bold", size=10.5, dy=0, x=M + 10)
    p.after_box(pad=6)
    p.box(34)
    p.line("SUS BENEFICIOS DE CALFRESH TERMINARAN EL 1 DE NOVIEMBRE DE 2026.",
           name="Helvetica-Bold", size=10.5, dy=0, x=M + 10)
    p.after_box()

    p.line("ENGLISH", name="Helvetica-Bold", size=10, dy=13)
    p.wrap("We did not receive the proof we asked for on September 14, 2026. "
           "Because of this, your CalFresh benefits will stop. You may ask for "
           "a state hearing within 90 days of the date of this notice. If you "
           "ask before October 12, 2026, your benefits may continue until a "
           "decision is made.")
    p.gap(6)
    p.rule(pad=3)

    p.line("ESPANOL", name="Helvetica-Bold", size=10, dy=13)
    p.wrap("No recibimos las pruebas que le pedimos el 14 de septiembre de "
           "2026. Por esta razon, sus beneficios de CalFresh terminaran. Puede "
           "pedir una audiencia estatal dentro de 90 dias de la fecha de este "
           "aviso. Si la pide antes del 12 de octubre de 2026, sus beneficios "
           "pueden continuar hasta que se tome una decision.")
    p.gap(8)
    p.line("1-800-743-8525    NA 960X SAR (10/24)", size=7.5)
    p.save()

    record(fn, "NA 960X SAR", "CalFresh", "Santa Clara County DSS", "en+es",
           "discontinuance", {
               "recipient_name": "JOSE RAMIREZ",
               "case_number": "01-9917-3320",
               "notice_date": "2026-10-02",
               "effective_date": "2026-11-01",
               "appeal_deadline": "2026-12-31",
               "aid_paid_pending_deadline": "2026-10-12",
           }, note="Bilingual single sheet -- tests language detection.")


# ------------------------------------------------------------- 08 SSA notice

def ssa(fn="08-ssa-redetermination-en.pdf"):
    p = Page(os.path.join(OUT, fn))
    p.line("SOCIAL SECURITY ADMINISTRATION", name="Helvetica-Bold", size=10, dy=12)
    p.line("Retirement, Survivors, and Disability Insurance", size=8.5, dy=0)
    p.right("Date: September 8, 2026", size=9, dy=13)
    p.rule(pad=4)

    p.line("Supplemental Security Income", name="Helvetica-Bold", size=12, dy=16)
    p.line("Notice of Redetermination", name="Helvetica-Bold", size=12, dy=16)
    p.gap(4)

    addr_block(p, "GLORIA HAYES", "1150 MERIDIAN AVE APT 22",
               "SAN JOSE, CA 95125", "XXX-XX-4821", "N/A",
               "1-800-772-1213")
    p.gap(4)

    p.wrap("We are reviewing your Supplemental Security Income (SSI) to make "
           "sure you are still eligible and that we are paying you the right "
           "amount. This review is called a redetermination.")
    p.gap(6)

    p.box(38)
    p.line("PLEASE REPLY BY:  OCTOBER 8, 2026",
           name="Helvetica-Bold", size=12, dy=0, x=M + 10)
    p.after_box()

    p.line("WHAT YOU NEED TO DO", name="Helvetica-Bold", size=10, dy=14)
    p.wrap("Call us at 1-800-772-1213 to schedule your redetermination "
           "interview, or visit your local office. Please have the following "
           "ready:")
    p.gap(2)
    p.checkbox("Bank statements for all accounts, last 3 months", False)
    p.checkbox("Proof of any income you or your spouse received", False)
    p.checkbox("Information about where you live and who lives with you", False)
    p.gap(6)

    p.wrap("IF YOU DO NOT REPLY, YOUR SSI PAYMENTS MAY STOP.",
           name="Helvetica-Bold", size=10)
    p.gap(6)
    p.line("IF YOU DISAGREE", name="Helvetica-Bold", size=10, dy=14)
    p.wrap("If you disagree with a decision we make after this review, you may "
           "appeal. You must ask for an appeal in writing within 60 days of "
           "the date you receive the decision notice.")
    p.gap(8)
    p.line("Form SSA-8202 (09-2026)", size=7.5)
    p.save()

    record(fn, "SSA-8202", "SSI", "Social Security Administration", "en",
           "recert_due", {
               "recipient_name": "GLORIA HAYES",
               "notice_date": "2026-09-08",
               "deadline_date": "2026-10-08",
               "appeal_window_days": "60",
               "required_docs": ["bank_statement", "proof_of_income",
                                 "living_arrangement"],
           }, note="Non-CDSS letterhead -- tests generalization beyond county forms.")


# ------------------------------------------------ 09 housing authority recert

def housing(fn="09-hcv-annual-recert-en.pdf"):
    p = Page(os.path.join(OUT, fn))
    p.line("HOUSING AUTHORITY OF THE COUNTY OF SANTA CLARA",
           name="Helvetica-Bold", size=10, dy=12)
    p.line("Housing Choice Voucher Program (Section 8)", size=8.5, dy=0)
    p.right("HCV-AR-101", size=8.5, dy=13)
    p.rule(pad=4)

    p.line("ANNUAL RECERTIFICATION NOTICE",
           name="Helvetica-Bold", size=13, dy=18)

    addr_block(p, "PATRICIA NGUYEN", "755 S 9TH ST UNIT B",
               "SAN JOSE, CA 95112", "HCV-33812", "AR-118",
               "(408) 275-8770")

    p.field("Notice Date", "AUGUST 20, 2026", labelw=150)
    p.field("Recertification Effective", "DECEMBER 1, 2026", labelw=185)
    p.gap(2)

    p.box(40)
    p.line("APPOINTMENT:  OCTOBER 6, 2026 AT 10:30 AM",
           name="Helvetica-Bold", size=11.5, dy=14, x=M + 10)
    p.line("505 W JULIAN ST, SAN JOSE, CA 95110 -- 2ND FLOOR",
           size=9.5, dy=0, x=M + 10)
    p.after_box()

    p.wrap("Your annual recertification is due. You must attend the "
           "appointment above and bring the documents listed below. If you "
           "cannot attend, call (408) 275-8770 at least 3 business days "
           "before the appointment to reschedule.")
    p.gap(6)

    p.line("BRING THESE DOCUMENTS", name="Helvetica-Bold", size=10, dy=14)
    p.checkbox("Photo identification for all adults in the household", True)
    p.checkbox("Social Security cards for all household members", True)
    p.checkbox("Proof of all income -- pay stubs from the last 60 days", True)
    p.checkbox("Bank statements, last 6 months, all accounts", True)
    p.checkbox("Current utility bills", True)
    p.gap(6)

    p.wrap("FAILURE TO ATTEND YOUR RECERTIFICATION APPOINTMENT MAY RESULT IN "
           "TERMINATION OF YOUR HOUSING ASSISTANCE.",
           name="Helvetica-Bold", size=10)
    p.gap(8)
    p.line("HCV-AR-101 (Rev. 01/26)", size=7.5)
    p.save()

    record(fn, "HCV-AR-101", "Housing Choice Voucher", "Housing Authority of Santa Clara County",
           "en", "recert_due", {
               "recipient_name": "PATRICIA NGUYEN",
               "case_number": "HCV-33812",
               "notice_date": "2026-08-20",
               "deadline_date": "2026-10-06",
               "appointment_time": "10:30",
               "appointment_address": "505 W JULIAN ST, SAN JOSE, CA 95110",
               "effective_date": "2026-12-01",
               "required_docs": ["photo_id", "ssn_card", "pay_stub",
                                 "bank_statement", "utility_bill"],
           }, note="Appointment-based deadline, not a mail-by date.")


# ------------------------------------------------------- 10 approval (happy)

def approval(fn="10-na960-approval-en.pdf"):
    p = Page(os.path.join(OUT, fn))
    header(p, "DEPARTMENT OF SOCIAL SERVICES", "SANTA CLARA",
           "NA 960 SAR", "10/24")
    p.gap(2)
    p.line("NOTICE OF ACTION", name="Helvetica-Bold", size=14, dy=18)
    p.line("CalFresh -- Approval", size=10.5, dy=13)
    p.rule(pad=3)

    addr_block(p, "SAMUEL BRIGHT", "1799 HAMILTON AVE APT 9",
               "SAN JOSE, CA 95125", "01-2204-6653", "SC-7781",
               "(408) 758-3401")

    p.field("Notice Date", "AUGUST 12, 2026", labelw=150)
    p.gap(4)

    p.box(56)
    p.line("YOUR CALFRESH APPLICATION IS APPROVED.",
           name="Helvetica-Bold", size=11.5, dy=15, x=M + 10)
    p.line("Monthly benefit:  $412.00", size=10.5, dy=13, x=M + 10)
    p.line("Benefits start:   AUGUST 15, 2026", size=10.5, dy=0, x=M + 10)
    p.after_box()

    p.line("IMPORTANT -- KEEP YOUR BENEFITS", name="Helvetica-Bold", size=10, dy=14)
    p.wrap("Your certification period ends on FEBRUARY 28, 2027. You must "
           "complete a Semi-Annual Eligibility Status Report (SAR 7) before "
           "then to keep receiving benefits. We will mail the form to you.")
    p.gap(6)
    p.wrap("You must report if your household income goes over $2,510 per "
           "month. Report changes within 10 days.")
    p.gap(6)
    p.line("YOUR HEARING RIGHTS", name="Helvetica-Bold", size=10, dy=14)
    p.wrap("If you disagree with the benefit amount, you may ask for a state "
           "hearing within 90 days of the date of this notice.")
    p.gap(8)
    p.line("NA 960 SAR (10/24)", size=7.5)
    p.save()

    record(fn, "NA 960 SAR", "CalFresh", "Santa Clara County DSS", "en",
           "approval", {
               "recipient_name": "SAMUEL BRIGHT",
               "case_number": "01-2204-6653",
               "notice_date": "2026-08-12",
               "effective_date": "2026-08-15",
               "certification_end": "2027-02-28",
               "monthly_amount": "412.00",
               "income_reporting_threshold": "2510.00",
               "appeal_deadline": "2026-11-10",
           }, note="Approval, not a deadline. App must NOT show a red countdown.")


# --------------------------------------------------------------------- main

if __name__ == "__main__":
    for fn in (sar7, na960x, cf3776, mc210rv, na960y,
               sar7_es, bilingual, ssa, housing, approval):
        fn()

    with open(os.path.join(OUT, "ground_truth.json"), "w") as f:
        json.dump({
            "generated_for": "Carta golden corpus",
            "warning": "ALL DATA FICTIONAL. Layouts are plausible "
                       "reconstructions for OCR testing, not official forms.",
            "notices": truth,
        }, f, indent=2)

    print(f"Wrote {len(truth)} PDFs + ground_truth.json to {OUT}")
    for t in truth:
        print(f"  {t['file']:44s} {t['form_id']:14s} {t['action_type']}")
