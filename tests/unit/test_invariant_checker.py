from services.invariant_checker.app import (
    evaluate_charge_at_most_once,
    build_trace_analysis,
)


def test_charge_at_most_once_passes_with_one_charge():
    trace = [
        {
            "sequence": 1,
            "operation": "PaymentCharged",
            "component": "ChargePayment",
            "orderId": "order_1",
            "phase": "SIDE_EFFECT_COMMITTED",
        }
    ]

    result = evaluate_charge_at_most_once(trace, "order_1")
    analysis = build_trace_analysis(trace, result)

    assert result["status"] == "PASSED"
    assert result["actual"] == 1
    assert result["expected"] == "<= 1"
    assert result["firstFailingSequence"] is None
    
    assert analysis["firstFailingSequence"] is None
    assert analysis["firstFailingOperation"] is None
    assert analysis["firstFailingComponent"] is None
    assert analysis["reason"] is None


def test_charge_at_most_once_fails_on_second_charge():
    trace = [
        {
            "sequence": 6,
            "operation": "PaymentCharged",
            "component": "ChargePayment",
            "orderId": "order_1",
            "phase": "SIDE_EFFECT_COMMITTED",
        },
        {
            "sequence": 7,
            "operation": "InjectedFailure",
            "component": "ChargePayment",
            "orderId": "order_1",
            "phase": "ATTEMPT_FAILED",
        },
        {
            "sequence": 9,
            "operation": "PaymentCharged",
            "component": "ChargePayment",
            "orderId": "order_1",
            "phase": "SIDE_EFFECT_COMMITTED",
        },
    ]

    result = evaluate_charge_at_most_once(trace, "order_1")
    analysis = build_trace_analysis(trace, result)

    assert result["status"] == "FAILED"
    assert result["actual"] == 2
    assert result["expected"] == "<= 1"
    assert result["firstFailingSequence"] == 9
    
    assert analysis["firstFailingSequence"] == 9
    assert analysis["firstFailingOperation"] == "PaymentCharged"
    assert analysis["firstFailingComponent"] == "ChargePayment"
    assert analysis["reason"] == "ChargeAtMostOnce violated"