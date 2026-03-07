from langgraph.graph import StateGraph, END

from app.graph.state.interview_creation_state import InterviewState
from app.graph.nodes.interview_creation_node import (
    load_context,
    generate_question,
    publish_question,
    wait_for_answer,
    evaluate_answer,
    store_step,
    check_continue,
    finalize,
)


# ─────────────────────────────────────────────
# ROUTER 1: after store_step
# If evaluate_answer flagged a followup AND
# we have a followup question → ask it
# Otherwise → check if we should continue
# ─────────────────────────────────────────────

def followup_router(state: InterviewState) -> str:
    followup = state.get("followup", False)
    followup_question = state.get("followup_question", "")
    timed_out = state.get("timeout", False)

    # Only follow up if: flagged, has question text, not timed out
    if followup and followup_question and not timed_out:
        print("[followup_router] → followup")
        return "followup"

    print("[followup_router] → check")
    return "check"


# ─────────────────────────────────────────────
# ROUTER 2: after check_continue
# If interview_complete → finalize
# Otherwise → generate next question
# ─────────────────────────────────────────────

def continue_router(state: InterviewState) -> str:
    if state.get("interview_complete"):
        print("[continue_router] → end")
        return "end"
    print("[continue_router] → generate")
    return "generate"


# ─────────────────────────────────────────────
# GRAPH BUILDER
# ─────────────────────────────────────────────

def build_interview_graph():
    graph = StateGraph(InterviewState)

    # Register all nodes
    graph.add_node("load_context", load_context)
    graph.add_node("generate_question", generate_question)
    graph.add_node("publish_question", publish_question)
    graph.add_node("wait_for_answer", wait_for_answer)
    graph.add_node("evaluate_answer", evaluate_answer)
    graph.add_node("store_step", store_step)
    graph.add_node("check_continue", check_continue)
    graph.add_node("finalize", finalize)

    # Entry point
    graph.set_entry_point("load_context")

    # ── Main linear flow ──────────────────────
    graph.add_edge("load_context", "generate_question")
    graph.add_edge("generate_question", "publish_question")
    graph.add_edge("publish_question", "wait_for_answer")
    graph.add_edge("wait_for_answer", "evaluate_answer")
    graph.add_edge("evaluate_answer", "store_step")

    # ── After store_step: followup or continue ─
    # followup → publish_question (asks followup_question, not current_question)
    # check    → check_continue
    graph.add_conditional_edges(
        "store_step",
        followup_router,
        {
            "followup": "publish_question",
            "check": "check_continue",
        },
    )

    # ── After check_continue: next Q or done ──
    # generate → generate_question (current_index already incremented)
    # end      → finalize
    graph.add_conditional_edges(
        "check_continue",
        continue_router,
        {
            "generate": "generate_question",
            "end": "finalize",
        },
    )

    # Terminal edge
    graph.add_edge("finalize", END)

    return graph.compile()