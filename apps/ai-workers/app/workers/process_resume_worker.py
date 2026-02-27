import json
from app.core.s3_client import download_resume
from app.core.redis_client import client
from app.graph.graph_registry.graph_registry import GRAPH_REGISTRY

def start_worker():
    print("Worker started. Waiting for jobs...")

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

                print("✅ Job completed successfully")

            except Exception as e:
                print(f"❌ Job failed: {e}")

                job["error"] = str(e)
                job["retries"] = job.get("retries", 0) + 1

                if job["retries"] <= 3:
                    print(f"Retrying job (attempt {job['retries']})...")
                    client.lpush("jobs", json.dumps(job))
                else:
                    print("Max retries reached. Moving to dead letter queue.")
                    client.lpush("jobs:failed", json.dumps(job))

        except Exception as e:
            print(f"Worker loop error: {str(e)}")