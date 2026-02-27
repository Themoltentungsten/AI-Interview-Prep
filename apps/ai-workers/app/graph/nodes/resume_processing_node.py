# =========================
# Imports
# =========================
from typing_extensions import TypedDict
from typing import List, Dict, Optional
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from neo4j import GraphDatabase
from app.core.s3_client import download_resume
from app.core.config import settings
from app.graph.state.resume_processing_state import ResumeProcessState
from app.workers.convert_pdf_to_image_worker import ocr_images_with_openai
import fitz, json, re, uuid

# =========================
# Models & Clients
# =========================
llm = ChatOpenAI(
    model="gpt-4o",
    temperature=0,
    api_key=settings.OPENAI_API_KEY
)

embedder = OpenAIEmbeddings(
    model="text-embedding-3-large",
    api_key=settings.OPENAI_API_KEY
)

qdrant_client = QdrantClient(url=settings.QDRANT_URI)
QDRANT_COLLECTION = "resumes"
EMBEDDING_DIM = 3072

neo4j_driver = GraphDatabase.driver(
    settings.NEO4J_URI,
    auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
)


# =========================
# Helpers
# =========================
def _ensure_qdrant_collection():
    existing = [c.name for c in qdrant_client.get_collections().collections]
    if QDRANT_COLLECTION not in existing:
        qdrant_client.create_collection(
            collection_name=QDRANT_COLLECTION,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE)
        )
        print(f"Created Qdrant collection: {QDRANT_COLLECTION}")


# =========================
# Nodes
#
# ✅ GOLDEN RULE: every node returns ONLY the keys it writes.
#    NEVER do {**state, "key": value}.
#    Spreading **state re-writes every existing key, which causes
#    INVALID_CONCURRENT_GRAPH_UPDATE when parallel branches run simultaneously.
# =========================

def download_node(state: ResumeProcessState):
    """
    Downloads the resume file from S3 using the file name stored in state.
    Returns only 'pdf_bytes' (or 'error' on failure).
    """
    print("Download Node Started")
    try:
        buffer = download_resume(key=state["s3_file_name"])
        return {"pdf_bytes": buffer}
    except Exception as e:
        return {"error": str(e)}


def convert_images_node(state: ResumeProcessState):
    """
    Converts each PDF page to a PNG image using PyMuPDF at 150 DPI.
    Returns only 'page_images' (or 'error' on failure).
    """
    print("Convert Image Node Started")
    try:
        if not state["s3_file_name"].endswith(".pdf"):
            return {}

        images = []
        mat = fitz.Matrix(150/72, 150/72)

        with fitz.open(stream=state["pdf_bytes"], filetype="pdf") as doc:
            for page in doc:
                pix = page.get_pixmap(matrix=mat)
                images.append(pix.tobytes("png"))

        return {"page_images": images}
    except Exception as e:
        return {"error": str(e)}


def ocr_node(state: ResumeProcessState):
    """
    Sends page images to OpenAI vision for OCR text extraction.
    Returns only 'raw_text' (or 'error' on failure).
    """
    print("OCR Node Started")
    try:
        page_images = state.get("page_images", [])
        text = ocr_images_with_openai(page_images)
        print("OCR text preview:", text[:300])
        return {"raw_text": text}
    except Exception as e:
        return {"error": str(e)}


def clean_node(state: ResumeProcessState):
    """
    Strips OCR artifacts (backticks, extra whitespace) from raw_text.
    Returns only 'cleaned_text'.
    """
    print("Clean Node Started")
    raw = state["raw_text"]
    raw = re.sub(r"```", "", raw)
    cleaned = re.sub(r"\s+", " ", raw).strip()
    print("Cleaned preview:", cleaned[:300])
    return {"cleaned_text": cleaned}


def structured_node(state: ResumeProcessState):
    """
    Uses GPT-4o to extract structured fields from cleaned_text.
    Returns only the 5 structured keys (or 'error' on failure).
    """
    print("Structured Node Started")
    try:
        cleaned_text = state.get("cleaned_text", "").strip()

        if not cleaned_text:
            return {"error": "cleaned_text is empty"}

        prompt = f"""You are an expert resume parser.

Your job is to extract structured information from the resume text below.

INSTRUCTIONS:
- Return ONLY a valid JSON object. No explanation, no markdown, no backticks.
- If a section does not exist in the resume, return an empty list [] for that key.
- Always return all 5 keys: skills, work_experience, education, projects, extracurricular.
- For skills: extract EVERYTHING from "Coursework / Skills", "Technical Skills", or any section listing technologies, languages, tools, frameworks, or concepts.
- Do not skip tools like Git, GitHub, VS Code, or AI frameworks like LangChain, LangGraph.
- For work_experience: if no formal jobs exist, return [].
- Do not merge separate entries. Each project, role, or activity is its own object.

OUTPUT FORMAT (return exactly this structure):
{{
  "skills": [{{"name": "Python", "category": "Language"}}],
  "work_experience": [{{"company": "", "role": "", "duration": "", "description": ""}}],
  "education": [{{"institution": "", "degree": "", "duration": "", "grade": ""}}],
  "projects": [{{"title": "", "tech_stack": [], "description": ""}}],
  "extracurricular": [{{"title": "", "organization": "", "duration": "", "description": ""}}]
}}

RESUME:
{cleaned_text}
"""
        response = llm.invoke(prompt)
        raw_content = response.content.strip()
        raw_content = re.sub(r"^```json|^```|```$", "", raw_content, flags=re.MULTILINE).strip()
        data = json.loads(raw_content)

        print("Skills count:", len(data.get("skills", [])))
        print("Projects count:", len(data.get("projects", [])))

        return {
            "skills":           data.get("skills", []),
            "work_experience":  data.get("work_experience", []),
            "education":        data.get("education", []),
            "projects":         data.get("projects", []),
            "extracurricular":  data.get("extracurricular", []),
        }

    except json.JSONDecodeError as e:
        print("JSON parse error:", str(e))
        return {"error": f"JSON decode failed: {str(e)}"}
    except Exception as e:
        print("Structured node error:", str(e))
        return {"error": str(e)}


def chunk_node(state: ResumeProcessState):
    """
    Splits cleaned_text into overlapping chunks using RecursiveCharacterTextSplitter.
    Returns only 'text_chunks'.
    """
    print("Chunk Node Started")
    try:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=100,
            separators=[". ", ", ", " ", ""],
            length_function=len,
        )
        chunks = splitter.split_text(state["cleaned_text"])
        print(f"Split into {len(chunks)} chunks")
        return {"text_chunks": chunks}
    except Exception as e:
        return {"error": str(e)}


def embedding_node(state: ResumeProcessState):
    """
    Generates 3072-dim embeddings for each chunk via text-embedding-3-large.
    Returns only 'chunk_embeddings'.
    """
    print("Embedding Node Started")
    try:
        embeddings = embedder.embed_documents(state["text_chunks"])
        print(f"Generated {len(embeddings)} embeddings, dim={len(embeddings[0])}")
        return {"chunk_embeddings": embeddings}
    except Exception as e:
        return {"error": str(e)}


def store_neo4j_node(state: ResumeProcessState):
    """
    Stores structured resume data as a graph in Neo4j.
    Uses user_id as the central Candidate node — one node per user,
    updated on every re-upload rather than creating duplicates.
    Returns only 'neo4j_node_id', 'neo4j_node_ids', 'stored_in_neo4j'.
    """
    print("Store Neo4j Node Started")
    try:
        file_id = state.get("file_id", str(uuid.uuid4()))
        user_id = state.get("user_id", "unknown")

        node_ids = {
            "candidate": None,
            "skills": [],
            "education": [],
            "work_experience": [],
            "projects": [],
            "extracurricular": [],
        }

        with neo4j_driver.session() as session:

            # ── 1. Central Candidate node keyed on user_id ──
            result = session.run(
                """
                MERGE (c:Candidate {user_id: $user_id})
                SET c.file_id      = $file_id,
                    c.s3_file_name = $s3_file_name,
                    c.updated_at   = timestamp()
                RETURN elementId(c) AS node_id
                """,
                user_id=user_id,
                file_id=file_id,
                s3_file_name=state.get("s3_file_name", ""),
            )
            node_ids["candidate"] = result.single()["node_id"]

            # ── 2. Skills ──
            for skill in state.get("skills", []):
                result = session.run(
                    """
                    MATCH (c:Candidate {user_id: $user_id})
                    MERGE (s:Skill {name: $name, category: $category})
                    MERGE (c)-[:HAS_SKILL]->(s)
                    RETURN elementId(s) AS node_id
                    """,
                    user_id=user_id,
                    name=skill.get("name", ""),
                    category=skill.get("category", ""),
                )
                node_ids["skills"].append(result.single()["node_id"])

            # ── 3. Education ──
            for edu in state.get("education", []):
                result = session.run(
                    """
                    MATCH (c:Candidate {user_id: $user_id})
                    CREATE (e:Education {
                        institution: $institution,
                        degree:      $degree,
                        duration:    $duration,
                        grade:       $grade
                    })
                    CREATE (c)-[:HAS_EDUCATION]->(e)
                    RETURN elementId(e) AS node_id
                    """,
                    user_id=user_id,
                    institution=edu.get("institution", ""),
                    degree=edu.get("degree", ""),
                    duration=edu.get("duration", ""),
                    grade=edu.get("grade", ""),
                )
                node_ids["education"].append(result.single()["node_id"])

            # ── 4. Work Experience ──
            for exp in state.get("work_experience", []):
                result = session.run(
                    """
                    MATCH (c:Candidate {user_id: $user_id})
                    CREATE (w:WorkExperience {
                        company:     $company,
                        role:        $role,
                        duration:    $duration,
                        description: $description
                    })
                    CREATE (c)-[:HAS_EXPERIENCE]->(w)
                    RETURN elementId(w) AS node_id
                    """,
                    user_id=user_id,
                    company=exp.get("company", ""),
                    role=exp.get("role", ""),
                    duration=exp.get("duration", ""),
                    description=exp.get("description", ""),
                )
                node_ids["work_experience"].append(result.single()["node_id"])

            # ── 5. Projects ──
            for proj in state.get("projects", []):
                result = session.run(
                    """
                    MATCH (c:Candidate {user_id: $user_id})
                    CREATE (p:Project {
                        title:       $title,
                        tech_stack:  $tech_stack,
                        description: $description
                    })
                    CREATE (c)-[:HAS_PROJECT]->(p)
                    RETURN elementId(p) AS node_id
                    """,
                    user_id=user_id,
                    title=proj.get("title", ""),
                    tech_stack=proj.get("tech_stack", []),
                    description=proj.get("description", ""),
                )
                node_ids["projects"].append(result.single()["node_id"])

            # ── 6. Extracurricular ──
            for extra in state.get("extracurricular", []):
                result = session.run(
                    """
                    MATCH (c:Candidate {user_id: $user_id})
                    CREATE (x:Extracurricular {
                        title:        $title,
                        organization: $organization,
                        duration:     $duration,
                        description:  $description
                    })
                    CREATE (c)-[:HAS_EXTRACURRICULAR]->(x)
                    RETURN elementId(x) AS node_id
                    """,
                    user_id=user_id,
                    title=extra.get("title", ""),
                    organization=extra.get("organization", ""),
                    duration=extra.get("duration", ""),
                    description=extra.get("description", ""),
                )
                node_ids["extracurricular"].append(result.single()["node_id"])

        print(f"Neo4j: Candidate node ID : {node_ids['candidate']}")
        print(f"Neo4j: Skills stored     : {len(node_ids['skills'])}")
        print(f"Neo4j: Projects stored   : {len(node_ids['projects'])}")

        return {
            "neo4j_node_id":   node_ids["candidate"],
            "neo4j_node_ids":  node_ids,
            "stored_in_neo4j": True,
        }

    except Exception as e:
        print("Neo4j node error:", str(e))
        return {"error": str(e)}

def store_qdrant_node(state: ResumeProcessState):
    """
    Upserts text chunks + embeddings into Qdrant with cross-reference metadata.
    Returns only 'qdrant_point_ids', 'stored_in_qdrant'.
    """
    print("Store Qdrant Node Started")
    try:
        _ensure_qdrant_collection()

        chunks        = state["text_chunks"]
        embeddings    = state["chunk_embeddings"]
        file_id       = state.get("file_id", str(uuid.uuid4()))
        user_id       = state.get("user_id", "unknown")
        neo4j_node_id = state.get("neo4j_node_id", None)

        if len(chunks) != len(embeddings):
            return {"error": f"Chunk/embedding mismatch: {len(chunks)} vs {len(embeddings)}"}

        point_ids = []
        points    = []

        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = str(uuid.uuid4())
            point_ids.append(point_id)
            points.append(
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "text":                 chunk,
                        "chunk_index":          i,
                        "total_chunks":         len(chunks),
                        "file_id":              file_id,
                        "user_id":              user_id,
                        "s3_file_name":         state.get("s3_file_name", ""),
                        "neo4j_resume_node_id": neo4j_node_id,
                    }
                )
            )

        qdrant_client.upsert(collection_name=QDRANT_COLLECTION, points=points)
        print(f"Qdrant: stored {len(points)} points")

        return {
            "qdrant_point_ids": point_ids,
            "stored_in_qdrant": True,
        }

    except Exception as e:
        print("Qdrant node error:", str(e))
        return {"error": str(e)}


