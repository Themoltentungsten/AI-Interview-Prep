
from app.graph.builder.resume_builder import build_resume_graph

GRAPH_REGISTRY = {
    "resume_processing": build_resume_graph(),
}