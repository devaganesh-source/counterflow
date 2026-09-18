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


def test_buggy_duplicate_charge_reports_business_impact():
    trace = [
        {
            "sequence": 2,
            "operation": "OrderCreated",
            "component": "CreateOrder",
            "orderId": "order_buggy",
            "phase": "SIDE_EFFECT_COMMITTED",
            "evidence": {"amount": 999},
        },
        {
            "sequence": 6,
            "operation": "PaymentCharged",
            "component": "ChargePayment",
            "orderId": "order_buggy",
            "phase": "SIDE_EFFECT_COMMITTED",
            "evidence": {"chargeId": "charge_1", "amount": 999},
        },
        {
            "sequence": 7,
            "operation": "InjectedFailure",
            "component": "ChargePayment",
            "orderId": "order_buggy",
            "phase": "ATTEMPT_FAILED",
        },
        {
            "sequence": 9,
            "operation": "PaymentCharged",
            "component": "ChargePayment",
            "orderId": "order_buggy",
            "phase": "SIDE_EFFECT_COMMITTED",
            "evidence": {"chargeId": "charge_2", "amount": 999},
        },
    ]

    result = evaluate_charge_at_most_once(trace, "order_buggy")
    analysis = build_trace_analysis(trace, result)

    assert result["status"] == "FAILED"
    assert result["expectedChargeCount"] == 1
    assert result["actualChargeCount"] == 2
    assert result["expectedAmount"] == 999
    assert result["actualCharged"] == 1998
    assert result["overcharge"] == 999
    assert result["chargeIds"] == ["charge_1", "charge_2"]
    assert result["firstFailingSequence"] == 9
    assert result["firstFailingOperation"] == "PaymentCharged"
    assert result["firstFailingComponent"] == "ChargePayment"

    assert analysis["firstFailingSequence"] == 9
    assert analysis["firstFailingOperation"] == "PaymentCharged"
    assert analysis["firstFailingComponent"] == "ChargePayment"
    assert analysis["reason"] == "ChargeAtMostOnce violated"


def test_fixed_retry_reports_no_overcharge():
    trace = [
        {
            "sequence": 2,
            "operation": "OrderCreated",
            "component": "CreateOrder",
            "orderId": "order_fixed",
            "phase": "SIDE_EFFECT_COMMITTED",
            "evidence": {"amount": 999},
        },
        {
            "sequence": 6,
            "operation": "PaymentCharged",
            "component": "ChargePayment",
            "orderId": "order_fixed",
            "phase": "SIDE_EFFECT_COMMITTED",
            "evidence": {"chargeId": "charge_order_fixed", "amount": 999},
        },
        {
            "sequence": 7,
            "operation": "InjectedFailure",
            "component": "ChargePayment",
            "orderId": "order_fixed",
            "phase": "ATTEMPT_FAILED",
        },
        {
            "sequence": 9,
            "operation": "PaymentReused",
            "component": "ChargePayment",
            "orderId": "order_fixed",
            "phase": "ATTEMPT_SUCCEEDED",
            "evidence": {"chargeId": "charge_order_fixed", "idempotentReplay": True},
        },
    ]

    result = evaluate_charge_at_most_once(trace, "order_fixed")
    analysis = build_trace_analysis(trace, result)

    assert result["status"] == "PASSED"
    assert result["expectedChargeCount"] == 1
    assert result["actualChargeCount"] == 1
    assert result["expectedAmount"] == 999
    assert result["actualCharged"] == 999
    assert result["overcharge"] == 0
    assert result["chargeIds"] == ["charge_order_fixed"]
    assert result["firstFailingSequence"] is None

    assert analysis["firstFailingSequence"] is None
    assert analysis["firstFailingOperation"] is None
    assert analysis["firstFailingComponent"] is None
    assert analysis["reason"] is None