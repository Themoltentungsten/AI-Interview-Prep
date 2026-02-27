from langgraph.graph import StateGraph, END
from app.graph.state.resume_processing_state import ResumeProcessState
from app.graph.nodes.resume_processing_node import (
    download_node,
    convert_images_node,
    ocr_node,
    clean_node,
    structured_node,
    chunk_node,
    embedding_node,
    store_qdrant_node,
    store_neo4j_node,
)


# =========================
# Graph
# =========================
def build_resume_graph():
    builder = StateGraph(ResumeProcessState)

    # ── Register all nodes ──
    builder.add_node("download", download_node)
    builder.add_node("convert", convert_images_node)
    builder.add_node("extract", ocr_node)
    builder.add_node("clean", clean_node)
    builder.add_node("structured", structured_node)
    builder.add_node("chunk", chunk_node)
    builder.add_node("embed", embedding_node)
    builder.add_node("store_qdrant", store_qdrant_node)
    builder.add_node("store_neo4j", store_neo4j_node)

    # ── Entry point ──
    builder.set_entry_point("download")

    # ── Edges ──
    #
    # download → convert → extract → clean
    #                                  │
    #                    ┌─────────────┴──────────────┐
    #                    ▼                            ▼
    #                structured                     chunk
    #                    │                            │
    #                    │                          embed
    #                    │                            │
    #                 store_neo4j                store_qdrant
    #                     │                          │
    #                    END                        END

    builder.add_edge("download", "convert")
    builder.add_edge("convert", "extract")
    builder.add_edge("extract", "clean")

    # Branch 1 — structured extraction → neon + neo4j (parallel)
    builder.add_edge("clean", "structured")
    
    builder.add_edge("structured", "store_neo4j")

    # Branch 2 — chunking → embedding → qdrant
    builder.add_edge("clean", "chunk")
    builder.add_edge("chunk", "embed")
    builder.add_edge("embed", "store_qdrant")

    # ── Terminal edges ──
    builder.add_edge("store_neo4j", END)
    builder.add_edge("store_qdrant", END)

    return builder.compile()