from services.invariant_checker.app import evaluate_charge_at_most_once


def test_charge_at_most_once_passes_with_one_charge():
    trace = [
        {
            "sequence": 1,
            "operation": "PaymentCharged",
            "orderId": "order_1",
            "phase": "SIDE_EFFECT_COMMITTED",
        }
    ]

    result = evaluate_charge_at_most_once(trace, "order_1")

    assert result["status"] == "PASSED"
    assert result["actual"] == 1
    assert result["expected"] == "<= 1"
    assert result["firstFailingSequence"] is None


def test_charge_at_most_once_fails_on_second_charge():
    trace = [
        {
            "sequence": 6,
            "operation": "PaymentCharged",
            "orderId": "order_1",
            "phase": "SIDE_EFFECT_COMMITTED",
        },
        {
            "sequence": 7,
            "operation": "InjectedFailure",
            "orderId": "order_1",
            "phase": "ATTEMPT_FAILED",
        },
        {
            "sequence": 9,
            "operation": "PaymentCharged",
            "orderId": "order_1",
            "phase": "SIDE_EFFECT_COMMITTED",
        },
    ]

    result = evaluate_charge_at_most_once(trace, "order_1")

    assert result["status"] == "FAILED"
    assert result["actual"] == 2
    assert result["expected"] == "<= 1"
    assert result["firstFailingSequence"] == 9