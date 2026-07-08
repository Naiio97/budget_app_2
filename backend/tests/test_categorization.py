"""Tests for services.categorization — pure-function matching engine, no DB.

Covers the bugs found in the categorization audit (2026-07-08):
- "dm" (Shopping keyword) must not match inside "odměna" (Salary) — word-
  boundary protection.
- "lidl" must still match a merchant glued to a reference code ("5465LIDL")
  — boundary protection must not require non-alphanumeric on both sides.
- diacritics folding lets an unaccented pattern match an accented description
  and vice versa.
- more specific (longer) pattern wins regardless of match_count.
- a rule learned from creditorName still matches when remittanceInformationUnstructured
  is present with different text (combined_text no longer picks "first non-empty").
"""
from models import CategoryRuleModel
from services.categorization import (
    categorize_by_mcc,
    categorize_by_purpose_code,
    categorize_transaction,
    categorize_with_preloaded_rules,
    combined_text,
    fold,
    pattern_matches,
)


def test_fold_strips_diacritics_and_lowercases():
    assert fold("Kavárna") == "kavarna"
    assert fold("ODMĚNA") == "odmena"
    assert fold(None) == ""


def test_pattern_matches_rejects_substring_inside_another_word():
    # "dm" (drogerie) nesmí chytit "odměna" (výplata/bonus)
    assert pattern_matches(fold("Mzda + odměna za 05/2026"), fold("dm")) is False


def test_pattern_matches_keeps_merchant_glued_to_reference_code():
    # merchant name slepený s referenčním kódem musí dál sedět
    assert pattern_matches(fold("NAKUP 5465LIDL CZ SRO BRNO"), fold("lidl")) is True


def test_pattern_matches_whole_word_still_matches():
    assert pattern_matches(fold("jdu do dm dnes"), fold("dm")) is True


def test_pattern_matches_diacritics_insensitive_both_directions():
    # pattern bez diakritiky proti popisu s diakritikou
    assert pattern_matches(fold("Kavárna Fra"), fold("kavarna")) is True
    # pattern s diakritikou proti popisu bez diakritiky
    assert pattern_matches(fold("kavarna fra"), fold("kavárna")) is True


def test_pattern_matches_empty_pattern_never_matches():
    assert pattern_matches(fold("cokoliv"), fold("")) is False


def test_combined_text_includes_creditor_name_even_with_unstructured_present():
    tx = {
        "remittanceInformationUnstructured": "VS: 20260708 platba",
        "creditorName": "Lidl Ceska Republika",
    }
    text = fold(combined_text(tx))
    assert "lidl" in text


def test_combined_text_includes_counterparty_account_numbers():
    # pravidlo na číslo protiúčtu (např. kreditka) musí jít matchnout,
    # i když popis nese jen jméno majitele
    tx = {
        "creditorName": "Bureš Nicolas",
        "creditorAccount": {"iban": "CZ3008000000001028717374", "bban": None},
        "debtorAccount": {"iban": "CZ1208000000004568285043"},
    }
    text = fold(combined_text(tx))
    assert pattern_matches(text, fold("1028717374")) is True


def test_combined_text_includes_additional_information():
    # Air Bank posílá popis poplatků jen v additionalInformation
    # (remittance i jména jsou prázdná) — pravidlo na něj musí jít matchnout
    tx = {
        "additionalInformation": "Poplatek za rozložení platby",
        "creditorName": "Nicolas Bureš",
    }
    text = fold(combined_text(tx))
    assert pattern_matches(text, fold("poplatek za rozlozeni platby")) is True


def test_rule_on_counterparty_account_number_categorizes():
    kreditka_rule = _rule("1028717374", "Installments")
    result = categorize_with_preloaded_rules(
        {
            "creditorName": "Bureš Nicolas",
            "creditorAccount": {"iban": "CZ3008000000001028717374"},
        },
        user_rules=[kreditka_rule],
        learned_rules=[],
    )
    assert result == "Installments"


def test_categorize_by_purpose_code():
    assert categorize_by_purpose_code({"purposeCode": "SALA"}) == "Salary"
    assert categorize_by_purpose_code({"purposeCode": "OTHR"}) is None
    assert categorize_by_purpose_code({}) is None


def test_categorize_by_mcc():
    assert categorize_by_mcc({"merchantCategoryCode": "5411"}) == "Food"
    assert categorize_by_mcc({"merchantCategoryCode": "9999"}) is None
    assert categorize_by_mcc({}) is None


def test_categorize_transaction_falls_back_to_other():
    assert categorize_transaction({}) == "Other"
    assert categorize_transaction({"purposeCode": "SALA"}) == "Salary"
    assert categorize_transaction({"merchantCategoryCode": "5411"}) == "Food"


def _rule(pattern: str, category: str, match_count: int = 0) -> CategoryRuleModel:
    return CategoryRuleModel(pattern=pattern, category=category, match_count=match_count)


def test_more_specific_pattern_wins_over_higher_match_count():
    # "albert" má víc zásahů, ale "albert heijn" je specifičtější — musí vyhrát,
    # když je seznam seřazený podle RULE_ORDER (délka patternu sestupně).
    broad = _rule("albert", "Food", match_count=100)
    specific = _rule("albert heijn", "Shopping", match_count=1)
    ordered = sorted([broad, specific], key=lambda r: (-len(r.pattern), -r.match_count))

    result = categorize_with_preloaded_rules(
        {"remittanceInformationUnstructured": "ALBERT HEIJN PRAHA 5"},
        user_rules=[],
        learned_rules=ordered,
    )
    assert result == "Shopping"


def test_user_rules_take_priority_over_purpose_code_and_mcc():
    user_rule = _rule("acme", "Shopping")
    result = categorize_with_preloaded_rules(
        {
            "remittanceInformationUnstructured": "ACME CORP",
            "purposeCode": "SALA",
            "merchantCategoryCode": "5411",
        },
        user_rules=[user_rule],
        learned_rules=[],
    )
    assert result == "Shopping"


def test_purpose_code_takes_priority_over_learned_rules():
    learned_rule = _rule("acme", "Shopping")
    result = categorize_with_preloaded_rules(
        {"remittanceInformationUnstructured": "ACME CORP", "purposeCode": "SALA"},
        user_rules=[],
        learned_rules=[learned_rule],
    )
    assert result == "Salary"


def test_salary_keyword_not_shadowed_by_shopping_keyword_collision():
    # regresní test na konkrétní bug: "dm" (Shopping) substring "odměna" (Salary)
    dm_rule = _rule("dm", "Shopping", match_count=500)
    odmena_rule = _rule("odměna", "Salary", match_count=1)
    ordered = sorted([dm_rule, odmena_rule], key=lambda r: (-len(r.pattern), -r.match_count))

    result = categorize_with_preloaded_rules(
        {"remittanceInformationUnstructured": "Mzda + odměna za 06/2026"},
        user_rules=[],
        learned_rules=ordered,
    )
    assert result == "Salary"


def test_no_match_falls_back_to_other():
    result = categorize_with_preloaded_rules(
        {"remittanceInformationUnstructured": "neznamy text bez shody"},
        user_rules=[],
        learned_rules=[_rule("billa", "Food")],
    )
    assert result == "Other"
