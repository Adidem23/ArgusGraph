from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent
UPLOAD_DIR = Path(os.getenv("ARGUSGRAPH_UPLOAD_DIR", str(PROJECT_DIR / "uploads"))).resolve()
OUTPUT_DIR = Path(os.getenv("ARGUSGRAPH_OUTPUT_DIR", str(PROJECT_DIR / "argusgraph_output"))).resolve()
# This must point to the full video pipeline script, NOT agent.py (the graph investigator).
PIPELINE_SCRIPT_RAW = Path(os.getenv("ARGUSGRAPH_PIPELINE_SCRIPT", str(PROJECT_DIR / "video_pipeline.py")))
PIPELINE_SCRIPT = (PROJECT_DIR / PIPELINE_SCRIPT_RAW).resolve() if not PIPELINE_SCRIPT_RAW.is_absolute() else PIPELINE_SCRIPT_RAW.resolve()
GRAPH_NAME = os.getenv("FALKORDB_GRAPH_NAME", "video_graph")
FALKORDB_HOST = os.getenv("FALKORDB_HOST", "localhost")
FALKORDB_PORT = int(os.getenv("FALKORDB_PORT", "6379"))
FALKORDB_PASSWORD = os.getenv("FALKORDB_PASSWORD") or None

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="ArgusGraph API", version="0.1.0")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:3001,http://127.0.0.1:3001").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# In-memory job state is suitable for the first local integration milestone.
# Use Redis/a durable queue if this becomes a multi-worker deployment.
jobs: dict[str, dict[str, Any]] = {}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_pipeline(video_path: Path, output_dir: Path, job_id: str) -> None:
    jobs[job_id].update(status="processing", stage="Running existing ArgusGraph pipeline", started_at=utc_now())
    try:
        if not PIPELINE_SCRIPT.exists():
            raise FileNotFoundError(
                f"Video pipeline script not found at {PIPELINE_SCRIPT}. Set ARGUSGRAPH_PIPELINE_SCRIPT to the script containing adaptive_sample(), enrich_frame(), gemini_scene(), and ingest_falkordb(). Do not point this at agent.py."
            )
        configured_python = os.getenv("ARGUSGRAPH_PYTHON")
        if configured_python:
            python_path = Path(configured_python)
            pipeline_python = str((PROJECT_DIR / python_path).resolve() if not python_path.is_absolute() else python_path.resolve())
        else:
            windows_venv = PROJECT_DIR / "venv" / "Scripts" / "python.exe"
            posix_venv = PROJECT_DIR / "venv" / "bin" / "python"
            pipeline_python = str(windows_venv if windows_venv.exists() else posix_venv if posix_venv.exists() else Path(os.sys.executable))
        cmd = [
            pipeline_python, str(PIPELINE_SCRIPT),
            "--video", str(video_path), "--output-dir", str(output_dir), "--graph-name", GRAPH_NAME,
        ]
        jobs[job_id]["command"] = cmd
        result = subprocess.run(cmd, capture_output=True, text=True, check=False, cwd=str(PIPELINE_SCRIPT.parent))
        jobs[job_id]["stdout"] = result.stdout[-12000:]
        jobs[job_id]["stderr"] = result.stderr[-12000:]
        if result.returncode != 0:
            raise RuntimeError(f"Pipeline exited with code {result.returncode}: {result.stderr[-3000:]}")
        index_path = output_dir / "argusgraph_index.json"
        if not index_path.exists():
            raise RuntimeError(f"Pipeline completed but index file was not created: {index_path}")
        index = json.loads(index_path.read_text(encoding="utf-8"))
        video_id = str(index.get("video_id") or video_path.stem)
        # Confirm that the same video exists in FalkorDB and return the actual graph records.
        graph = get_graph_for_video(video_id)
        # Return the existing pipeline's frame analysis without recomputing it.
        # Gemini scene_description and BLIP blip_caption remain distinct fields.
        frames = []
        for record in index.get("frames", []):
            scene = record.get("gemini_scene") or {}
            frames.append({
                "frame_id": record.get("frame_id"),
                "timestamp_seconds": record.get("timestamp_seconds"),
                "frame_index": record.get("frame_index"),
                "image_path": record.get("image_path"),
                "object_count": record.get("object_count"),
                "detections": record.get("detections", []),
                "blip_caption": record.get("blip_caption"),
                "gemini_status": record.get("gemini_status"),
                "gemini_error": record.get("gemini_error"),
                "gemini_scene": scene,
                "scene_description": record.get("scene_description", scene.get("scene_description", "")),
                "scene_type": record.get("scene_type", scene.get("scene_type", "unknown")),
                "activities": record.get("activities", scene.get("activities", [])),
                "safety_concerns": record.get("safety_concerns", scene.get("safety_concerns", [])),
                "visible_evidence": record.get("visible_evidence", scene.get("visible_evidence", [])),
                "uncertainty": record.get("uncertainty", scene.get("uncertainty", [])),
            })
        jobs[job_id].update(
            status="completed", stage="Graph loaded from FalkorDB", completed_at=utc_now(),
            video_id=video_id, graph=graph, frames=frames,
            summary={"frames_processed": len(index.get("frames", [])), "nodes": len(graph["nodes"]), "edges": len(graph["edges"]),
                     "video_name": index.get("video_name", video_path.name), "duration_seconds": index.get("duration_seconds")},
        )
    except Exception as exc:
        jobs[job_id].update(status="failed", stage="Failed", error=str(exc), completed_at=utc_now())


def get_graph_for_video(video_id: str) -> dict[str, Any]:
    """Read the real Video -> Frame -> FrameAttribute graph from FalkorDB."""
    try:
        from falkordb import FalkorDB
        client = FalkorDB(host=FALKORDB_HOST, port=FALKORDB_PORT, password=FALKORDB_PASSWORD)
        graph = client.select_graph(GRAPH_NAME)
        result = graph.query(
            """
            MATCH (v:Video {video_id: $video_id})-[r:HAS_FRAME]->(f:Frame)
            OPTIONAL MATCH (f)-[ar:HAS_ATTRIBUTE]->(a:FrameAttribute)
            RETURN v.video_id, v.name, id(v), f.frame_id, f.name, id(f), id(r),
                   a.name, a.key, a.value, id(a), id(ar)
            ORDER BY f.frame_id
            """,
            {"video_id": video_id},
        )
    except Exception as exc:
        raise RuntimeError(f"Could not read graph '{GRAPH_NAME}' from FalkorDB at {FALKORDB_HOST}:{FALKORDB_PORT}: {exc}") from exc

    nodes: dict[str, dict[str, Any]] = {}
    edges: dict[str, dict[str, Any]] = {}
    for row in result.result_set:
        values = list(row)
        v_id, v_name, v_dbid, f_id, f_name, f_dbid, r_dbid, a_name, a_key, a_value, a_dbid, ar_dbid = (values + [None] * 12)[:12]
        if not f_id:
            continue
        video_node_id = f"video:{v_id}"
        frame_node_id = f"frame:{f_id}"
        nodes[video_node_id] = {"data": {"id": video_node_id, "label": str(v_name or v_id), "type": "video", "meta": "Video source", "video_id": v_id, "db_id": v_dbid}}
        nodes[frame_node_id] = {"data": {"id": frame_node_id, "label": str(f_name or f_id), "type": "frame", "meta": "Frame", "frame_id": f_id, "video_id": v_id, "db_id": f_dbid}}
        edge_id = f"rel:has-frame:{r_dbid if r_dbid is not None else f_id}"
        edges[edge_id] = {"data": {"id": edge_id, "source": video_node_id, "target": frame_node_id, "label": "HAS_FRAME", "type": "HAS_FRAME"}}
        if a_dbid is not None and a_key is not None:
            attr_id = f"attribute:{a_dbid}"
            value_text = str(a_value) if a_value is not None else ""
            nodes[attr_id] = {"data": {"id": attr_id, "label": str(a_key), "type": "attribute", "meta": "Frame attribute", "key": a_key, "value": value_text, "frame_id": f_id, "db_id": a_dbid}}
            rel_id = f"rel:has-attribute:{ar_dbid if ar_dbid is not None else f'{f_id}:{a_dbid}'}"
            edges[rel_id] = {"data": {"id": rel_id, "source": frame_node_id, "target": attr_id, "label": "HAS_ATTRIBUTE", "type": "HAS_ATTRIBUTE"}}

    if not nodes:
        raise RuntimeError(f"No graph records found for video_id={video_id!r} in FalkorDB graph {GRAPH_NAME!r}.")
    # Return data ready for Cytoscape.js; positions are left to the frontend layout engine.
    return {"video_id": video_id, "graph_name": GRAPH_NAME, "nodes": list(nodes.values()), "edges": list(edges.values())}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "argusgraph-api"}


@app.post("/api/videos/upload", status_code=202)
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)) -> dict[str, Any]:
    filename = Path(file.filename or "video.mp4").name
    if not filename.lower().endswith((".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v")):
        raise HTTPException(status_code=400, detail="Unsupported video extension. Use MP4, MOV, AVI, MKV, WEBM, or M4V.")
    job_id = str(uuid.uuid4())
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    video_path = job_dir / filename
    try:
        with video_path.open("wb") as out:
            shutil.copyfileobj(file.file, out)
    finally:
        await file.close()
    output_dir = OUTPUT_DIR / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    jobs[job_id] = {"job_id": job_id, "status": "queued", "stage": "Upload saved; waiting for processor", "filename": filename, "created_at": utc_now()}
    background_tasks.add_task(asyncio.to_thread, run_pipeline, video_path, output_dir, job_id)
    return {"job_id": job_id, "status": "queued", "filename": filename, "status_url": f"/api/jobs/{job_id}"}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found. Jobs are currently stored in memory; restart clears them.")
    return job


@app.get("/api/videos/{video_id}/graph")
def get_video_graph(video_id: str) -> dict[str, Any]:
    try:
        return get_graph_for_video(video_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/jobs/{job_id}/frames")
def get_job_frames(job_id: str) -> dict[str, Any]:
    """Return frame analysis emitted by the existing pipeline, unchanged in meaning."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.get("status") != "completed":
        raise HTTPException(status_code=409, detail=f"Pipeline job is {job.get('status')}.")
    return {"job_id": job_id, "video_id": job.get("video_id"), "frames": job.get("frames", [])}
