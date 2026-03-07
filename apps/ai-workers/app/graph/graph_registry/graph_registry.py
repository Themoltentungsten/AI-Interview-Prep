
from app.graph.builder.resume_builder import build_resume_graph
from app.graph.builder.interview_builder import build_interview_graph

GRAPH_REGISTRY = {
    "resume_processing": build_resume_graph(),
    "interview_creation": build_interview_graph(),
}