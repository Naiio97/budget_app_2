"""Parser výplatní pásky (PDF) — zpětná vazba pro odhad výplaty.

Extrakce textu přes pypdf. Textová vrstva pásky (Elanor) má rozházené
sloupce (Kč a hodiny příjmových řádků slepené do jednoho čísla), proto
se čtou jen jednoznačně ukotvené údaje: měsíc, základní mzda a průměr
náhrad z hlavičky (stabilní pořadí hodnot), srážkové řádky (jedno číslo)
a „Mzda na účet". To stačí na porovnání s odhadem a kalibraci konfigurace.
"""
import io
import re
from dataclasses import dataclass, field
from typing import Optional

from pypdf import PdfReader


@dataclass
class PayslipData:
    year_month: Optional[str] = None       # "2026-06"
    base_monthly: Optional[float] = None   # Zákl.měsíční mzda
    prumer: Optional[float] = None         # Prům.náhrady (Kč/h)
    na_ucet: Optional[float] = None        # Mzda na účet
    srazky: dict = field(default_factory=dict)  # sz/zp/dan_zaloha/sleva/stravenky


# Srážkové řádky mají v textové vrstvě čistý tvar "Label 1234"
SRAZKY_PATTERNS = {
    "sz": r"Odvod SZ-zaměstnanec\s+(-?\d+)",
    "zp": r"Odvod ZP-zaměstnanec\s+(-?\d+)",
    "dan_zaloha": r"Zálohová daň\s+(-?\d+)",
    "sleva": r"Sleva na poplatníka\s+(-?\d+)",
    "stravenky": r"Stravenky I?\.?\s+(-?\d+)",
}


def parse_payslip_text(text: str) -> PayslipData:
    data = PayslipData()
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    m = re.search(r"\b(\d{4}-(0[1-9]|1[0-2]))\b", text)
    if m:
        data.year_month = m.group(1)

    m = re.search(r"Mzda na účet\s+(-?\d+)", text)
    if m:
        data.na_ucet = float(m.group(1))

    for key, pattern in SRAZKY_PATTERNS.items():
        m = re.search(pattern, text)
        if m:
            data.srazky[key] = float(m.group(1))

    # Hlavička: hodnoty stojí na samostatných řádcích před labely v pořadí
    # ... / "65 000" (zákl. mzda, s mezerou tisíců) / "40.000" (úvazek,
    # 3 desetinná místa) / "395.66" (průměr, 2 desetinná místa) / "22.00 /"
    # (fond, s lomítkem) ... Bereme první výskyty odpovídajících tvarů
    # před řádkem "Pracovní poměr".
    header_end = next(
        (i for i, line in enumerate(lines) if line.startswith("Pracovní poměr")),
        len(lines),
    )
    for line in lines[:header_end]:
        if data.base_monthly is None and re.fullmatch(r"\d{1,3}(?: \d{3})+", line):
            data.base_monthly = float(line.replace(" ", ""))
        elif data.prumer is None and re.fullmatch(r"\d{2,4}\.\d{2}", line):
            data.prumer = float(line)

    return data


def parse_payslip(file_bytes: bytes) -> PayslipData:
    reader = PdfReader(io.BytesIO(file_bytes))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return parse_payslip_text(text)
