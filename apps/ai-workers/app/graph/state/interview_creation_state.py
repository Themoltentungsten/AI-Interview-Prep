from typing import List, Dict, Optional, Any
from typing_extensions import TypedDict


class InterviewState(TypedDict, total=False):

    # -------------------------
    # Core interview info
    # -------------------------
    interview_id: str
    user_id: str
    role: str
    interview_type: str
    description: Optional[str]

    # -------------------------
    # Context retrieval
    # -------------------------
    resume_context: List[str]
    skills: List[str]
    memories: List[Dict[str, Any]]
    candidate_name: str

    # -------------------------
    # Question flow
    # -------------------------
    current_index: int
    current_question: str
    question_history: List[Dict[str, Any]]
    difficulty: str

    # -------------------------
    # User response
    # -------------------------
    user_answer: str
    timeout: bool

    # -------------------------
    # Evaluation
    # -------------------------
    score: float
    confidence: float
    feedback: str
    followup: bool
    followup_question: str

    # -------------------------
    # Interview flow control
    # -------------------------
    interview_complete: bool
    start_time: int          # set in load_context, used by finalize for duration calc

    # -------------------------
    # Final summary
    # -------------------------
    summary: Dict[str, Any]