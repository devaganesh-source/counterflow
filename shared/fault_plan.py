def should_inject_fault(
    event: dict,
    *,
    fault_type: str,
    target: str,
    attempt: int,
) -> bool:
    fault_plan = event.get("faultPlan", {})

    for fault in fault_plan.get("faults", []):
        if (
            fault.get("type") == fault_type
            and fault.get("target") == target
            and fault.get("attempt") == attempt
        ):
            return True

    return False