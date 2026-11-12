#!/usr/bin/env python3
"""Builds the Grok fill workbook (12 Nov 2026) from the export rows.

Input:  a JSON list (one object per investor, deduplicated by With Intelligence id) read from
        wi_mandates with the Opportunities filters: Matched, plus Review (uncertain) at 45% or
        above or not yet scored, rows not pending or merged. See docs/grok-fill-2026-11-12.md.
Output: an .xlsx with two sheets, "Investors" (pre-filled + blank columns for Grok) and
        "Contacts" (one row per person, filled by Grok).
Usage:  python3 scripts/grok-fill-export.py export.json Taranis-Grok-fill-2026-11-12.xlsx
"""
import json
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

PRE = [  # (header, key, width)
    ('Row', None, 6),
    ('With Intelligence id', 'wi', 14),
    ('Investor name', 'name', 40),
    ('Profile link', 'link', 30),
    ('Verdict', 'verdict', 10),
    ('Score', 'score', 8),
    ('Country', 'country', 14),
    ('City', 'city', 14),
    ('Type', 'type', 24),
    ('AUM band', 'aum_band', 14),
    ('Console row ids', 'ids', 16),
    ('iConnections firm', 'firm', 28),
    ('iConnections link', 'how', 20),
    ('iConnections contacts we hold', 'iconn_people', 36),
    ('Alert contact we hold', 'alert_contacts', 24),
]
GROK = [
    ('Name on profile', 30), ('Website', 28), ('Firm LinkedIn', 28), ('General email', 26),
    ('Phone', 18), ('Head-office address', 36), ('Other names', 30),
    ('Read status', 12), ('Date read', 12), ('Notes', 40),
]
CONTACTS = [
    ('Row', 6), ('With Intelligence id', 14), ('Investor name', 36), ('Contact name', 26),
    ('Title', 30), ('Email', 30), ('Phone', 18), ('LinkedIn', 30), ('Location', 20),
]

FILL_PRE = PatternFill('solid', fgColor='DFEFF3')    # the app's soft teal: ours, keep as is
FILL_GROK = PatternFill('solid', fgColor='EEF2FB')   # indigo, the card's iConnections colour
HEAD_PRE = PatternFill('solid', fgColor='00657B')
HEAD_GROK = PatternFill('solid', fgColor='3D5AA8')
WHITE = Font(bold=True, color='FFFFFF')


def header(ws, cols, fills):
    for i, ((name, width), fill) in enumerate(zip(cols, fills), start=1):
        c = ws.cell(row=1, column=i, value=name)
        c.font, c.fill = WHITE, fill
        c.alignment = Alignment(wrap_text=True, vertical='top')
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.freeze_panes = 'D2'
    ws.auto_filter.ref = 'A1:' + get_column_letter(len(cols)) + '1'


def build(rows, out):
    wb = Workbook()
    ws = wb.active
    ws.title = 'Investors'
    cols = [(h, w) for h, _, w in PRE] + GROK
    header(ws, cols, [HEAD_PRE] * len(PRE) + [HEAD_GROK] * len(GROK))
    for n, r in enumerate(rows, start=1):
        for i, (_, key, _) in enumerate(PRE, start=1):
            v = n if key is None else r.get(key)
            if key == 'score' and v is not None:
                v = float(v)
            c = ws.cell(row=n + 1, column=i, value=v if v not in ('', None) else None)
            c.fill = FILL_PRE
            if key == 'score':
                c.number_format = '0%'
            if key == 'link' and v:
                c.hyperlink, c.font = v, Font(color='00657B', underline='single')
        for j in range(len(GROK)):
            ws.cell(row=n + 1, column=len(PRE) + 1 + j).fill = FILL_GROK
    last = len(rows) + 1
    status_col = get_column_letter(len(PRE) + 1 + [h for h, _ in GROK].index('Read status'))
    dv = DataValidation(type='list', formula1='"read,not found,blocked"', allow_blank=True)
    dv.add(f'{status_col}2:{status_col}{last}')
    ws.add_data_validation(dv)

    wc = wb.create_sheet('Contacts')
    header(wc, CONTACTS, [HEAD_GROK] * len(CONTACTS))
    wb.save(out)


if __name__ == '__main__':
    build(json.load(open(sys.argv[1])), sys.argv[2])
