#!/usr/bin/env python3
"""
The Carta demonstration SAR 7: a printable blank form, its checking template,
and the photographed-and-filled fixtures the form check is tested against.

AUTHORSHIP: Claude. Tooling, not app code.

WHY A DEMONSTRATION FORM AND NOT THE STATE'S
--------------------------------------------
The form check lines a photo up with a *known blank form* and then looks inside
the answer boxes. That needs the exact position of every box on the page. The
state's own SAR 7 (tools/forms/sar7-calsaws-rev-12-14.pdf) is a two-page form
whose print layout varies with the CalSAWS print run, and nobody on this project
has a printed, county-issued copy to measure. So the check ships with ONE
template: this fictional form, which is laid out like the corpus SAR 7 (same
header, same fictional household, same submit-by box, so the rest of Carta reads
it exactly as it reads notice 01) and prints its own disclaimer in the footer.

The three rules it checks are the state form's own, quoted verbatim from the
CalSAWS SAR 7 (12/14): every YES/NO question answered, the signature present,
and the form "signed and dated after the last day of the report month". The
demonstration form prints the last of those in the same words the real one does.

USAGE
-----
    python3 tools/forms/make-demo-sar7.py draw
        writes the blank form (PNG + printable PDF), the region map, and the
        fixture images under tests/fixtures/formcheck/

    python3 tools/forms/make-demo-sar7.py template <blank.ocr.json>
        joins the region map with Apple Vision's reading of the blank form
        and writes content/forms/carta-demo-sar7.json

`tools/forms/build-demo-sar7.sh` runs both, with the OCR step in between.

Nothing here is random at run time: every stroke is seeded, so the fixtures are
byte-reproducible on the same Pillow version.
"""

import json
import math
import os
import random
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'tools', 'forms', 'demo')
FIXTURES = os.path.join(ROOT, 'tests', 'fixtures', 'formcheck')
TEMPLATE_OUT = os.path.join(ROOT, 'content', 'forms', 'carta-demo-sar7.json')

W, H = 1700, 2200            # US Letter at 200 dpi
M = 110                      # page margin

HELV = '/System/Library/Fonts/Helvetica.ttc'
HAND = '/System/Library/Fonts/Noteworthy.ttc'


def font(size, bold=False):
    return ImageFont.truetype(HELV, size, index=1 if bold else 0)


def hand(size):
    return ImageFont.truetype(HAND, size, index=1)


# --------------------------------------------------------------------- layout

BOX = 36          # answer box, px
YES_X, NO_X = 1190, 1350
QUESTIONS = [
    # id, section heading drawn above it (or None), y of the question line, label
    ('q1', 'SECTION 1 -- INCOME', 950, '1. Did anyone in the home get income last month?'),
    ('q2', 'SECTION 2 -- HOUSEHOLD CHANGES', 1120, '2. Did anyone move into or out of your home?'),
    ('q3', None, 1184, '3. Did your address change?'),
]
SIG_LINE_Y = 1762
SIG_X0, SIG_X1 = 330, 1060
DATE_X0, DATE_X1 = 1200, W - M


def draw_blank():
    img = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(img)
    ink = 20

    def text(xy, s, size=27, bold=False):
        d.text(xy, s, font=font(size, bold), fill=ink)

    def rule(y, width=2):
        d.line([(M, y), (W - M, y)], fill=ink, width=width)

    text((M, 110), 'STATE OF CALIFORNIA', 22, True)
    text((M, 142), 'HEALTH AND HUMAN SERVICES AGENCY', 22, True)
    text((M, 174), 'SANTA CLARA COUNTY', 22)
    right = 'SAR 7  (Rev. 5/25)'
    rw = d.textlength(right, font=font(22, True))
    text((W - M - rw, 174), right, 22, True)
    rule(214)

    text((M, 240), 'SEMI-ANNUAL ELIGIBILITY STATUS REPORT', 38, True)
    text((M, 294), 'CalFresh / CalWORKs', 27)
    rule(346)

    for i, line in enumerate(['MARIA REYES', '1428 STORY ROAD APT 12', 'SAN JOSE, CA 95122']):
        text((M, 372 + 36 * i), line, 26)
    rx = W - M - 520
    for i, line in enumerate(['Case Number:  01-4472-9931', 'Worker ID:  SC-2214', 'Phone:  (408) 758-3401']):
        text((rx, 372 + 36 * i), line, 25)
    rule(500)

    text((M, 524), 'YOU MUST COMPLETE, SIGN, AND RETURN THIS FORM.', 27, True)
    d.rectangle([M, 572, W - M, 712], outline=ink, width=3)
    text((M + 24, 592), 'SUBMIT BY:  SEPTEMBER 5, 2026', 33, True)
    text((M + 24, 652), 'Report Month:  AUGUST 2026      Benefit Month:  OCTOBER 2026', 26)

    para = ('If your completed report is not received by the submit date shown above, '
            'your benefits may be delayed, reduced, or discontinued. If you cannot return '
            'the form on time, contact your worker before the submit date.')
    wrap(d, para, M, 740, W - 2 * M, font(26), 36, ink)
    rule(870)

    regions = {'questions': []}
    for qid, heading, y, label in QUESTIONS:
        if heading:
            text((M, y - 54), heading, 27, True)
        text((M, y), label, 27)
        for x, word in ((YES_X, 'YES'), (NO_X, 'NO')):
            d.rectangle([x, y - 4, x + BOX, y - 4 + BOX], outline=ink, width=3)
            text((x + BOX + 14, y), word, 27)
        regions['questions'].append({
            'id': qid,
            'number': int(qid[1:]),
            'label': label,
            'yes': [YES_X, y - 4, BOX, BOX],
            'no': [NO_X, y - 4, BOX, BOX],
        })
        if qid == 'q1':
            text((M + 34, y + 50), 'If YES, attach proof of all the income you got.', 24)

    rule(1260)
    text((M, 1286), 'SECTION 3 -- PROOF YOU MUST SEND', 27, True)
    text((M, 1336), 'Attach copies. Do not send originals.', 24)
    for i, doc in enumerate(['All paycheck stubs received last month',
                             'Current rent receipt or lease agreement',
                             'Most recent utility bill']):
        text((M + 10, 1382 + 40 * i), '-  ' + doc, 26)
    rule(1530)

    completeness = ('YOU MUST SIGN AND DATE THIS REPORT AFTER THE LAST DAY OF THE REPORT MONTH '
                    'OR IT WILL BE CONSIDERED INCOMPLETE.')
    wrap(d, completeness, M, 1556, W - 2 * M, font(24, True), 34, ink)

    text((M, 1728), 'Signature', 27)
    d.line([(SIG_X0, SIG_LINE_Y), (SIG_X1, SIG_LINE_Y)], fill=ink, width=2)
    text((1110, 1728), 'Date', 27)
    d.line([(DATE_X0, SIG_LINE_Y), (DATE_X1, SIG_LINE_Y)], fill=ink, width=2)

    text((M, 1860), 'Questions? Call (408) 758-3401.  Se habla espanol.', 22)
    text((M, 2100), 'SAR 7 (Rev. 5/25)  CARTA DEMONSTRATION COPY - NOT AN OFFICIAL FORM', 20)

    # Above the printed lines, stopping short of them, so a blank form reads as
    # no ink at all and a signature that dips through the line still counts.
    regions['signature'] = {'label': 'Signature', 'box': [SIG_X0 + 6, SIG_LINE_Y - 118, SIG_X1 - SIG_X0 - 12, 112]}
    regions['signature_date'] = {'label': 'Date', 'box': [DATE_X0 + 6, SIG_LINE_Y - 104, DATE_X1 - DATE_X0 - 12, 98]}
    regions['report_month_label'] = 'Report Month:'
    regions['completeness_sentence'] = completeness
    return img, regions


def wrap(d, s, x, y, width, f, lead, fill):
    words, cur = s.split(), ''
    for word in words:
        trial = (cur + ' ' + word).strip()
        if d.textlength(trial, font=f) <= width:
            cur = trial
        else:
            d.text((x, y), cur, font=f, fill=fill)
            y += lead
            cur = word
    if cur:
        d.text((x, y), cur, font=f, fill=fill)
    return y + lead


# ------------------------------------------------------------ filling by hand

PEN = 40  # blue-black pen, as a grey level on a grey page


def mark_x(d, box, rng):
    x, y, w, h = box
    j = lambda: rng.uniform(-3, 3)
    d.line([(x + 7 + j(), y + 7 + j()), (x + w - 7 + j(), y + h - 7 + j())], fill=PEN, width=6)
    d.line([(x + w - 7 + j(), y + 7 + j()), (x + 7 + j(), y + h - 7 + j())], fill=PEN, width=6)


def mark_tick(d, box, rng):
    x, y, w, h = box
    pts = [(x + 6, y + h * 0.55), (x + w * 0.4, y + h - 6), (x + w - 4, y + 4)]
    d.line([(px + rng.uniform(-2, 2), py + rng.uniform(-2, 2)) for px, py in pts], fill=PEN, width=6, joint='curve')


def signature(d, box, rng):
    """A cursive-looking scrawl: a smooth curve through jittered waypoints."""
    x, y, w, h = box
    n = 14
    xs = np.linspace(x + 40, x + min(w - 60, 520), n)
    base = y + h - 28
    ys = [base - (rng.uniform(10, 62) if i % 2 else rng.uniform(0, 18)) for i in range(n)]
    pts = catmull_rom(list(zip(xs, ys)), 12)
    d.line(pts, fill=PEN, width=5, joint='curve')
    # an underline flourish, as people do
    d.line([(x + 50, base + 10), (x + min(w - 40, 560), base + 4)], fill=PEN, width=4)


def catmull_rom(points, steps):
    out = []
    for i in range(1, len(points) - 2):
        p0, p1, p2, p3 = points[i - 1], points[i], points[i + 1], points[i + 2]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
                       (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
                for k in range(2)))
    return out


def handwritten_date(img, box, value):
    x, y, w, h = box
    layer = Image.new('L', (w, h), 255)
    ld = ImageDraw.Draw(layer)
    ld.text((14, 8), value, font=hand(50), fill=PEN)
    layer = layer.rotate(1.5, resample=Image.BICUBIC, fillcolor=255)
    img.paste(Image.composite(layer, img.crop((x, y, x + w, y + h)), layer.point(lambda v: 255 if v < 200 else 0)), (x, y))


def fill(blank, regions, spec, seed):
    img = blank.copy()
    d = ImageDraw.Draw(img)
    rng = random.Random(seed)
    for q in regions['questions']:
        answer = spec['answers'].get(q['id'])
        style = spec.get('style', {}).get(q['id'], 'x')
        for option in ('yes', 'no'):
            if answer == option or answer == 'both':
                (mark_tick if style == 'tick' else mark_x)(d, q[option], rng)
    if spec.get('signed'):
        signature(d, regions['signature']['box'], rng)
    if spec.get('date'):
        handwritten_date(img, regions['signature_date']['box'], spec['date'])
    return img


# --------------------------------------------------------------- the "photo"

def photograph(page, seed):
    """Put the page on a table, at an angle, under uneven light, through a lens."""
    rng = random.Random(seed)
    out_w, out_h = 1760, 2346
    table = np.full((out_h, out_w), 118, np.float32)
    table += np.random.default_rng(seed).normal(0, 6, (out_h, out_w)).astype(np.float32)

    # Where the page's corners land in the photo: a tilted, slightly keystoned sheet.
    dst = [(110 + rng.uniform(-20, 20), 150 + rng.uniform(-20, 20)),
           (1640 + rng.uniform(-20, 20), 105 + rng.uniform(-20, 20)),
           (1700 + rng.uniform(-15, 15), 2235 + rng.uniform(-20, 20)),
           (70 + rng.uniform(-15, 15), 2280 + rng.uniform(-20, 20))]
    src = [(0, 0), (W, 0), (W, H), (0, H)]
    coeffs = perspective_coeffs(dst, src)
    warped = page.transform((out_w, out_h), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=0)
    mask = Image.new('L', page.size, 255).transform((out_w, out_h), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=0)

    arr = np.asarray(warped, np.float32)
    m = np.asarray(mask, np.float32) / 255.0
    composed = arr * m + table * (1 - m)

    # Light falls off across the sheet: brighter top-left, dimmer bottom-right.
    yy, xx = np.mgrid[0:out_h, 0:out_w].astype(np.float32)
    light = 1.04 - 0.16 * (xx / out_w * 0.5 + yy / out_h * 0.5)
    composed = np.clip(composed * light, 0, 255).astype(np.uint8)

    img = Image.fromarray(composed, 'L').filter(ImageFilter.GaussianBlur(1.1))
    return img.resize((1700, round(1700 * out_h / out_w)), Image.LANCZOS)


def perspective_coeffs(dst, src):
    """PIL wants the map from OUTPUT pixels back to INPUT pixels."""
    a, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(a, np.float64), np.array(b, np.float64)).tolist()


# ---------------------------------------------------------------- fixtures

FIXTURE_SPECS = [
    # name, photographed?, what is on the page, what the check must say
    ('good-flat', False, {'answers': {'q1': 'yes', 'q2': 'no', 'q3': 'no'}, 'signed': True, 'date': '9/2/2026'}),
    ('good-photo', True, {'answers': {'q1': 'yes', 'q2': 'no', 'q3': 'no'}, 'signed': True, 'date': '9/2/2026'}),
    ('no-signature-photo', True, {'answers': {'q1': 'no', 'q2': 'no', 'q3': 'no'}, 'signed': False, 'date': '9/3/2026'}),
    ('early-date-photo', True, {'answers': {'q1': 'yes', 'q2': 'yes', 'q3': 'no'}, 'signed': True, 'date': '8/28/2026'}),
    ('unanswered-photo', True, {'answers': {'q1': 'yes', 'q2': None, 'q3': 'both'}, 'style': {'q1': 'tick'},
                                'signed': True, 'date': '9/1/2026'}),
    ('blank-photo', True, {'answers': {}, 'signed': False, 'date': None}),
]


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    if sys.argv[1] == 'draw':
        os.makedirs(OUT_DIR, exist_ok=True)
        os.makedirs(FIXTURES, exist_ok=True)
        blank, regions = draw_blank()
        blank.save(os.path.join(OUT_DIR, 'sar7-demo-blank.png'), optimize=True)
        # Print this one. 200 dpi, so it comes out at US Letter.
        blank.convert('RGB').save(os.path.join(OUT_DIR, 'sar7-demo-blank.pdf'), resolution=200)
        with open(os.path.join(OUT_DIR, 'regions.json'), 'w') as f:
            json.dump(regions, f, indent=1)
        for i, (name, photo, spec) in enumerate(FIXTURE_SPECS):
            page = fill(blank, regions, spec, seed=100 + i)
            img = photograph(page, seed=200 + i) if photo else page
            img.save(os.path.join(FIXTURES, name + '.jpg'), quality=84, optimize=True)
        with open(os.path.join(FIXTURES, 'specs.json'), 'w') as f:
            json.dump([{'name': n, 'photographed': p, **s} for n, p, s in FIXTURE_SPECS], f, indent=1)
        print('drew blank form, regions and', len(FIXTURE_SPECS), 'fixtures')
    elif sys.argv[1] == 'template':
        write_template(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(1)


def rule_gap(box):
    """Pixels from the bottom of a writing area to the printed rule under it."""
    return SIG_LINE_Y - (box[1] + box[3])


def normalise(box):
    x, y, w, h = box
    return {'x': round(x / W, 5), 'y': round(y / H, 5), 'w': round(w / W, 5), 'h': round(h / H, 5)}


def write_template(ocr_path):
    with open(os.path.join(OUT_DIR, 'regions.json')) as f:
        regions = json.load(f)
    with open(ocr_path) as f:
        ocr = json.loads(f.readline())

    # Anchors: every line Vision reads on the blank form that is long enough to
    # be distinctive and appears once. Duplicates (two "YES", two "NO") would
    # match the wrong twin half the time, so they are left out entirely.
    # Keyed on letters and digits only, the way the app compares them: Vision
    # reads the three answer-box rows as "• YES • NO", "•YES • NO" and "•YES
    # •NO", which differ as strings and are the same line to a matcher. They are
    # also exactly the lines a pen changes, so they are useless as anchors twice.
    seen = {}
    for line in ocr['lines']:
        key = re.sub(r'[^A-Z0-9]', '', line['text'].upper())
        seen.setdefault(key, []).append(line)
    anchors = [
        {'text': ' '.join(lines[0]['text'].split()), 'box': lines[0]['box']}
        for key, lines in seen.items()
        if len(lines) == 1 and len(key) >= 8
    ]

    template = {
        '_about': ('Checking template for the Carta demonstration SAR 7 (tools/forms/demo/sar7-demo-blank.pdf). '
                   'Generated by tools/forms/make-demo-sar7.py. Do not edit by hand: regenerate.'),
        'id': 'carta-demo-sar7',
        'form_id': 'SAR 7',
        'revision': '5/25',
        'footer_marker': 'CARTA DEMONSTRATION COPY',
        'anchors': anchors,
        'questions': [
            {'id': q['id'], 'number': q['number'], 'label': q['label'],
             'yes': normalise(q['yes']), 'no': normalise(q['no'])}
            for q in regions['questions']
        ],
        # rule_below: the gap from the bottom of each writing area down to its
        # printed rule, so the check can find the rule and measure relative to it.
        'signature': {'label': regions['signature']['label'], 'box': normalise(regions['signature']['box']),
                      'rule_below': round(rule_gap(regions['signature']['box']) / H, 5)},
        'signature_date': {'label': regions['signature_date']['label'], 'box': normalise(regions['signature_date']['box']),
                           'rule_below': round(rule_gap(regions['signature_date']['box']) / H, 5)},
        'report_month_label': regions['report_month_label'],
        'rules': {
            'answered': {
                'form_says': 'A SAR 7 is "complete" only when: All of the YES/NO questions are answered',
                'if_not': 'If your report is not complete when you turn it in, you will be asked to complete the '
                          'questions you did not answer and/or turn in the proof that the report asked for. '
                          'Your benefits may be late.',
            },
            'signed': {
                'form_says': 'A SAR 7 is "complete" only when: All of the required signatures are on the form',
                'if_not': 'If your report is not complete when you turn it in, you will be asked to complete the '
                          'questions you did not answer and/or turn in the proof that the report asked for. '
                          'Your benefits may be late.',
            },
            'dated_after_report_month': {
                'form_says': regions['completeness_sentence'],
                'if_not': 'If you sign and date your report before the first day of the submit month, you will be '
                          'asked to sign and date it again.',
            },
        },
        'source_url': 'https://www.calsaws.org/wp-content/uploads/2022/03/SAR-7-GR-SAR71_SAR-7-English.pdf',
        'source_name': 'CalSAWS, SAR 7 (12/14) Eligibility Status Report, instructions page and signature section',
        'source_copy': 'tools/forms/sar7-calsaws-rev-12-14.pdf',
        'verified_on': '2026-09-24',
        'confidence': 'high',
    }
    os.makedirs(os.path.dirname(TEMPLATE_OUT), exist_ok=True)
    with open(TEMPLATE_OUT, 'w') as f:
        json.dump(template, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print('template:', len(anchors), 'anchors,', len(template['questions']), 'questions ->', TEMPLATE_OUT)


if __name__ == '__main__':
    main()
