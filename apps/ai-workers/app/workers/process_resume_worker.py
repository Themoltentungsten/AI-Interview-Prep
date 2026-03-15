import json
import sys

# Force UTF-8 output so emoji/special chars never crash the worker on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from app.core.redis_client import client
from app.graph.graph_registry.graph_registry import GRAPH_REGISTRY

def _safe_print(msg: str):
    """Print that never crashes regardless of terminal encoding."""
    try:
        print(msg)
    except Exception:
        print(msg.encode("ascii", errors="replace").decode("ascii"))

def start_worker():
    _safe_print("Worker started. Waiting for jobs...")

    while True:
        try:
            _, job_data = client.brpop("jobs")
            job = json.loads(job_data)

            graph_type = job.get("type")
            payload = job.get("payload", {})

            try:
                graph = GRAPH_REGISTRY.get(graph_type)

                if not graph:
                    raise Exception(f"Unknown graph type: {graph_type}")

                # Invoke graph using payload directly
                final_state = graph.invoke(payload)

                if final_state.get("error"):
                    raise Exception(final_state["error"])

                _safe_print("[OK] Job completed successfully")

            except Exception as e:
                _safe_print(f"[FAIL] Job failed: {e}")

                job["error"] = str(e)
                job["retries"] = job.get("retries", 0) + 1

                if job["retries"] <= 3:
                    _safe_print(f"Retrying job (attempt {job['retries']})...")
                    client.lpush("jobs", json.dumps(job))
                else:
                    _safe_print("Max retries reached. Moving to dead letter queue.")
                    client.lpush("jobs:failed", json.dumps(job))

        except Exception as e:
            _safe_print(f"Worker loop error: {str(e)}")