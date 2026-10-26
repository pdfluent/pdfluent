#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
"""Build xfa_calc_order.pdf: a one-page dynamic XFA order form with a script.

`total` carries a JavaScript `calculate` script (quantity times unit price), so
a commit to `quantity` or `unit_price` must change `total`. `discount_code` carries a
FormCalc script, which the runtime does not run and the editor must say so.
`broken_hook` carries a JavaScript script that throws, which the editor must
name. `internal_ref` is read-only, so a commit to it must be refused. The form is generated here, not
copied from a third party, and has no datasets packet: the first fill creates it.

    python3 src-tauri/tests/fixtures/make_xfa_calc.py

It also builds xfa_calc_runaway.pdf: the same form, but `total` writes a value and
then never returns, so the open lifecycle always hits the script time limit
whatever the build profile.

tests: pdf_engine::tests::xfa_commit_recalculates_a_dependent_field and
pdf_engine::tests::a_script_that_times_out_on_open_leaves_the_document_clean (src-tauri).
"""
import os

XDP = """<?xml version="1.0" encoding="UTF-8"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/">
  <subform name="order" layout="paginate" locale="en_US">
    <pageSet>
      <pageArea name="Page1" id="Page1">
        <contentArea x="0.5in" y="0.5in" w="7.5in" h="10in"/>
        <medium stock="default" short="8.5in" long="11in"/>
      </pageArea>
    </pageSet>
    <subform name="lines" layout="tb" w="7.5in">
      <field name="quantity" w="3in" h="0.3in">
        <caption><value><text>Quantity</text></value></caption>
        <ui><textEdit/></ui>
        <value><text>1</text></value>
      </field>
      <field name="unit_price" w="3in" h="0.3in">
        <caption><value><text>Unit price</text></value></caption>
        <ui><textEdit/></ui>
        <value><text>5</text></value>
      </field>
      <field name="total" w="3in" h="0.3in">
        <caption><value><text>Total</text></value></caption>
        <ui><textEdit/></ui>
        <value><text/></value>
        <calculate>
          <script contentType="application/x-javascript">
var q = Number(xfa.resolveNode("order.lines.quantity").rawValue);
var p = Number(xfa.resolveNode("order.lines.unit_price").rawValue);
this.rawValue = String((isNaN(q) ? 0 : q) * (isNaN(p) ? 0 : p));
          </script>
        </calculate>
      </field>
      <field name="discount_code" w="3in" h="0.3in">
        <caption><value><text>Discount code</text></value></caption>
        <ui><textEdit/></ui>
        <value><text/></value>
        <event activity="change">
          <script contentType="application/x-formcalc">$ = Upper($)</script>
        </event>
      </field>
      <field name="broken_hook" w="3in" h="0.3in">
        <caption><value><text>Broken hook</text></value></caption>
        <ui><textEdit/></ui>
        <value><text/></value>
        <event activity="change">
          <script contentType="application/x-javascript">throw new Error("broken");</script>
        </event>
      </field>
      <field name="internal_ref" w="3in" h="0.3in" access="readOnly">
        <caption><value><text>Internal reference</text></value></caption>
        <ui><textEdit/></ui>
        <value><text>REF-001</text></value>
      </field>
    </subform>
  </subform>
</template>
</xdp:xdp>
"""


def build(xdp: str) -> bytes:
    xdp_bytes = xdp.encode("utf-8")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
        b"<< /Length 0 >>\nstream\n\nendstream",
        b"<< /XFA 6 0 R /Fields [] >>",
        b"<< /Length %d >>\nstream\n" % len(xdp_bytes) + xdp_bytes + b"\nendstream",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n" % (len(objs) + 1)
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objs) + 1,
        xref,
    )
    return bytes(out)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "xfa_calc_order.pdf")
    with open(path, "wb") as f:
        f.write(build(XDP))
    print(path)

    marker = 'this.rawValue = String((isNaN(q) ? 0 : q) * (isNaN(p) ? 0 : p));'
    assert marker in XDP
    runaway = XDP.replace(marker, 'this.rawValue = "7";\nwhile (true) {}')
    path = os.path.join(here, "xfa_calc_runaway.pdf")
    with open(path, "wb") as f:
        f.write(build(runaway))
    print(path)
