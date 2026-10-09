"""Párování výdajů s transakcemi — scénáře s vymyšlenými daty."""
from types import SimpleNamespace as NS

from services.expense_matching import match_expenses


def ex(i, name, amount):
    return NS(id=i, name=name, amount=amount)


def tx(i, desc, amount, category=None, raw=None):
    return NS(id=i, description=desc, amount=amount, category=category, raw_json=raw)


def loan(i, name, amount, due):
    return NS(id=i, name=name, amount=amount, due_date=due)


def dtx(i, date, desc, amount, category=None):
    return NS(id=i, date=date, description=desc, amount=amount, category=category, raw_json=None)


def run(expenses, txs, patterns=None, categories=None):
    res = match_expenses(expenses, txs, patterns or {}, categories or {}, set())
    return {e.name: (t.id, reason) for e, t, reason in res}


def pairs(res):
    return [(t.id, r) for _, t, r in res]


def test_name_in_description_matches_transfer_message():
    # Zpráva příjemci nese název výdaje — i když částka není stejná.
    out = run(
        [ex(1, "Posilovna", 1500), ex(2, "Energie", 4200), ex(3, "Kapesné", 8000)],
        [tx("a", "Posilovna", -1500, "Internal Transfer"), tx("b", "Energie 10", -4200),
         tx("c", "Kapesné", -8000)],
    )
    assert out == {"Posilovna": ("a", "name"), "Energie": ("b", "name"), "Kapesné": ("c", "name")}


def test_czech_diacritics_and_case_are_folded():
    assert run([ex(1, "Poplatek čt", 120)], [tx("a", "Poplatek ČT", -120)]) == {"Poplatek čt": ("a", "name")}


def test_similar_amount_alone_does_not_match():
    # Přibližná částka (±5 %) bez další shody dřív lepila „zaplaceno" na cizí platby.
    out = run(
        [ex(1, "Drobný poplatek", 55), ex(2, "Jízdenka", 300), ex(3, "Holič", 750)],
        [tx("a", "SUPERMARKET 12", -56.7), tx("b", "OPERATOR CZ", -289.6), tx("c", "Autodíly", -713.2)],
    )
    assert out == {}


def test_exact_amount_matches_when_unambiguous():
    out = run([ex(1, "Nájem", 18000)], [tx("a", "Jan Novák", -18000), tx("b", "Potraviny", -310)])
    assert out == {"Nájem": ("a", "amount")}


def test_exact_amount_ambiguous_between_expenses_is_skipped():
    # Dvě položky po 500 Kč a jediná platba bez zprávy — nelze poznat které patří.
    out = run([ex(1, "Spoření", 500), ex(2, "Předplatné", 500)], [tx("a", "Jan Novák", -500)])
    assert out == {}


def test_exact_amount_ambiguous_between_transactions_is_skipped():
    out = run([ex(1, "Nájem", 500)], [tx("a", "A", -500), tx("b", "B", -500)])
    assert out == {}


def test_name_disambiguates_equal_amounts():
    out = run([ex(1, "Spoření", 500), ex(2, "Předplatné", 500)],
              [tx("a", "Spoření", -500), tx("b", "Předplatné služba", -500)])
    assert out == {"Spoření": ("a", "name"), "Předplatné": ("b", "name")}


def test_pattern_beats_name_and_reads_raw_json():
    out = match_expenses(
        [ex(1, "Telefon", 649)],
        [tx("a", "PLATBA KARTOU", -1175.97, raw='{"creditorName": "Operator Czech"}'),
         tx("b", "Telefon", -649)],
        {1: "operator czech"}, {}, set(),
    )
    assert pairs(out) == [("a", "pattern")]


def test_category_needs_unique_candidate_within_10_percent():
    assert run([ex(1, "Streaming", 577)], [tx("a", "AMSTERDAM NL video", -600, "Subscription")],
               categories={1: "Subscription"}) == {"Streaming": ("a", "category")}
    assert run([ex(1, "Streaming", 577)],
               [tx("a", "X", -600, "Subscription"), tx("b", "Y", -590, "Subscription")],
               categories={1: "Subscription"}) == {}


def test_transaction_used_only_once():
    used = {"a"}
    res = match_expenses([ex(1, "Posilovna", 1500)], [tx("a", "Posilovna", -1500)], {}, {}, used)
    assert res == []


def test_exact_amount_beats_name_with_half_amount():
    # Skříň 7000: platba s polovinou částky obsahuje název, ale přesná částka je jinde.
    out = run([ex(1, "Skříň", 7000)],
              [tx("a", "Skříň záloha", -3500), tx("b", "Zpráva pro příjemce", -7000)])
    assert out == {"Skříň": ("b", "amount")}


def test_name_with_wildly_different_amount_is_rejected():
    assert run([ex(1, "Eshop", 99)], [tx("a", "eshop.cz", -2107.74)]) == {}


def test_amount_one_koruna_off_is_not_exact():
    assert run([ex(1, "Internet", 349)], [tx("a", "Restaurace U Mostu", -350)]) == {}


def test_amount_tolerance_scales_for_large_amounts():
    assert run([ex(1, "Nábytek", 5001)], [tx("a", "Zpráva", -5000)]) == {"Nábytek": ("a", "amount")}


# ── splátky úvěrů ─────────────────────────────────────────────────────────

def test_loan_installment_paid_early_matches_by_amount():
    # Splatnost 16. 10., zaplaceno 9. 10. (7 dní) → jen přesná částka.
    res = match_expenses([loan(-1, "Notebook", 900, "2026-10-16")],
                         [dtx("a", "2026-10-09", "VS:1234567890", -900)], {}, {}, set())
    assert pairs(res) == [("a", "amount")]


def test_loan_installment_near_due_date_is_schedule():
    res = match_expenses([loan(-1, "Kolo", 1000, "2026-09-08")],
                         [dtx("a", "2026-09-08", "Jan Novák", -1000)], {}, {}, set())
    assert pairs(res) == [("a", "schedule")]


def test_loan_ignores_payment_from_other_month():
    res = match_expenses([loan(-1, "Kolo", 1000, "2026-10-08")],
                         [dtx("a", "2026-09-08", "Jan Novák", -1000)], {}, {}, set())
    assert res == []


def test_loan_two_equal_candidates_is_ambiguous():
    res = match_expenses([loan(-1, "Kolo", 1000, "2026-10-08")],
                         [dtx("a", "2026-10-08", "Jan Novák", -1000), dtx("b", "2026-10-08", "Salon", -1000)],
                         {}, {}, set())
    assert res == []


def test_loan_pattern_resolves_ambiguity():
    res = match_expenses([loan(-1, "Kolo", 1000, "2026-10-08")],
                         [dtx("a", "2026-10-08", "Jan Novák", -1000), dtx("b", "2026-10-08", "Salon", -1000)],
                         {-1: "novák"}, {}, set())
    assert pairs(res) == [("a", "pattern")]


def test_loan_closest_to_due_date_wins():
    res = match_expenses([loan(-1, "Kolo", 1000, "2026-09-08")],
                         [dtx("a", "2026-09-08", "Jan Novák", -1000),
                          dtx("b", "2026-09-07", "Jan Novák", -1000),
                          dtx("c", "2026-09-04", "Jan Novák", -1000)], {}, {}, set())
    assert pairs(res) == [("a", "schedule")]


# ── štítky: jména kontaktů a tagy ─────────────────────────────────────────

def test_contact_name_label_matches_loan_by_shared_word():
    # Kontakt k IBANu příjemce se jmenuje „SK - Notebook"; úvěr „Notebook Pro".
    txs = [dtx("a", "2026-09-09", "VS:1234567890", -900), dtx("b", "2026-09-22", "Kavárna", -900)]
    res = match_expenses([loan(-1, "Notebook Pro", 900, "2026-09-16")], txs, {}, {}, set(),
                         labels={"a": ["SK - Notebook"]})
    assert pairs(res) == [("a", "label")]


def test_tag_label_matches_exact_name_and_beats_equal_amounts():
    txs = [dtx("a", "2026-10-08", "Jan Novák", -1000), dtx("b", "2026-10-08", "Salon", -1000)]
    res = match_expenses([loan(-1, "Půjčka na kolo", 1000, "2026-10-08")], txs, {}, {}, set(),
                         labels={"a": ["Půjčka na kolo"]})
    assert pairs(res) == [("a", "label")]


def test_label_does_not_match_unrelated_expense():
    res = match_expenses([ex(1, "Streaming", 577)], [tx("a", "X", -577)], {}, {}, set(),
                         labels={"a": ["SK - Notebook"]})
    assert pairs(res) == [("a", "amount")]  # jen přesná částka, štítek nic nedělá
