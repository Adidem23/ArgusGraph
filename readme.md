
# ArgusGraph — Spatiotemporal CCTV Intelligence Agent

ArgusGraph transforms CCTV footage into a queryable spatiotemporal knowledge graph. It enables users to ask natural-language questions about observed activities, retrieve frame-level evidence, and explore relationships between video frames and extracted attributes.

The system combines computer vision, multimodal AI, graph databases, and agentic investigation through the Model Context Protocol (MCP).

**Demo video:** [Watch ArgusGraph on YouTube](https://youtu.be/YAU1LjTdET8?si=FkvikBKzJF_ssnDN)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Graph Data Model](#graph-data-model)
- [Cypher Queries](#cypher-queries)
- [Prerequisites](#prerequisites)
- [Setup Guide](#setup-guide)
- [Running the Application](#running-the-application)
- [How It Works](#how-it-works)
- [Project Artifacts](#project-artifacts)
- [Troubleshooting](#troubleshooting)
- [Responsible Use](#responsible-use)
- [Future Improvements](#future-improvements)
- [Demo](#demo)

---

## Overview

Traditional CCTV investigation often requires manually reviewing long recordings to locate specific activities or events.

ArgusGraph addresses this challenge by converting video footage into a graph of timestamped frames and their associated observations. Users can query the resulting graph through natural language and inspect the evidence behind the agent's response.

The system has two primary workflows:

1. **Video inference and graph ingestion:** Processes video frames, extracts visual information, and stores structured frame and attribute data in FalkorDB.
2. **Agentic investigation:** Uses an LLM-powered agent and MCP tools to query the graph with Cypher and generate evidence-grounded responses.

The goal is to make video evidence searchable, connected, and easier to investigate.

## Architecture

<img width="2770" height="505" alt="Email_Validator Diagram" src="https://github.com/user-attachments/assets/91e363f9-ce75-42c4-ac35-ae9bb6a30cd3" />


### Architecture Overview

The system consists of a frontend, FastAPI backend, video inference pipeline, agentic investigation layer, MCP server/client, and FalkorDB graph database.

### 1. Frontend

The frontend provides the interface for interacting with ArgusGraph.

Responsibilities:

- Upload CCTV videos.
- Submit natural-language investigation queries.
- Display agent-generated findings and supporting evidence.
- Visualize graph nodes and relationships.
- Zoom, pan, and fit the graph to the viewport.
- Select graph nodes to inspect their properties.

**Technologies:** React.js, Next.js, Cytoscape.js.

### 2. FastAPI Backend

The FastAPI backend coordinates communication between the frontend and backend workflows.

Responsibilities:

- Receive video uploads.
- Trigger the existing video inference pipeline.
- Route investigation queries to the agent.
- Return responses to the frontend.
- Handle API errors and service communication.

The API layer should orchestrate the existing inference pipeline rather than reimplementing or replacing its video-processing logic.

### 3. Video Inference Pipeline

The video inference pipeline transforms uploaded footage into structured, queryable evidence.

Pipeline stages:

1. **Video Upload:** Receives the input video.
2. **Adaptive Frame Sampling:** Selects representative frames for processing.
3. **BLIP Captioning:** Generates natural-language descriptions of sampled frames.
4. **CLIP Image Embeddings:** Produces visual representations of sampled frames.
5. **Gemini Scene Description:** Generates richer scene-level descriptions where enabled and available.
6. **Inference JSON:** Stores structured inference results for downstream processing.
7. **Graph Creation:** Converts video, frame, and attribute information into graph nodes and relationships in FalkorDB.

The actual outputs and enabled stages depend on the configured inference pipeline.

### 4. Agentic Investigation Layer

The agent handles natural-language questions about the indexed video.

Responsibilities:

- Understand the user's investigation query.
- Select appropriate MCP tools.
- Retrieve relevant graph evidence.
- Execute or request Cypher queries through available tools.
- Correlate observations across timestamps.
- Generate concise findings with frame IDs and timestamps.

The agent is the investigation and query layer. It is separate from video encoding and graph ingestion.

### 5. MCP Server and Client

The Model Context Protocol connects the agent to tools that interact with the graph database.

The flow is:

1. The agent determines which graph information is needed.
2. The MCP client invokes an available tool.
3. The MCP server executes the corresponding database operation.
4. FalkorDB returns matching graph records.
5. The agent uses the returned evidence to construct its response.

### 6. FalkorDB Graph Database

FalkorDB stores the graph representation of the processed video.

It connects videos, timestamped frames, and frame attributes so that Cypher queries can traverse the relationships and retrieve evidence.

Documentation: [FalkorDB](https://docs.falkordb.com/)

---

## Key Features

- Video ingestion and frame-level inference.
- Adaptive sampling of video frames.
- Image captioning and scene-description integration.
- Graph-based representation of video observations.
- Natural-language investigation using an LLM-powered agent.
- MCP-based access to graph-querying tools.
- Cypher-based retrieval and traversal.
- Frame-level evidence with timestamps and identifiers.
- Interactive graph exploration.
- Node-property inspection through the frontend.

Feature availability depends on the configured models, credentials, and implementation.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React.js, Next.js |
| Graph Visualization | Cytoscape.js |
| Backend API | FastAPI, Python |
| Graph Database | FalkorDB |
| Graph Query Language | Cypher |
| Agent Framework | Deep Agents |
| Language Model | Gemini 2.5 Flash |
| Tool Integration | Model Context Protocol (MCP) |
| Image Captioning | BLIP |
| Image Embeddings | CLIP |
| Scene Understanding | Gemini |
| Object Detection | YOLO, where enabled |
| Data Artifacts | JSON, NumPy arrays |

Verify the actual model versions and enabled components against the project configuration before deployment.

---

## Graph Data Model

ArgusGraph uses a property graph to represent video evidence.

### Graph Structure

```text
(Video)-[:HAS_FRAME]->(Frame)-[:HAS_ATTRIBUTE]->(FrameAttribute)
```

### Node Labels

| Node | Description |
|---|---|
| `Video` | Represents an ingested video. |
| `Frame` | Represents a sampled frame with its timestamp and metadata. |
| `FrameAttribute` | Represents an extracted observation or attribute associated with a frame. |

### Relationships

| Relationship | Direction | Purpose |
|---|---|---|
| `HAS_FRAME` | `Video → Frame` | Connects a video to its sampled frames. |
| `HAS_ATTRIBUTE` | `Frame → FrameAttribute` | Connects a frame to its associated attributes. |

### Example Graph

```text
(:Video {
    name: "CCTV_Feed_2"
})
    |
    | HAS_FRAME
    v
(:Frame {
    frame_id: "CCTV_Feed_2_frame_000003",
    timestamp: 2.5
})
    |
    | HAS_ATTRIBUTE
    v
(:FrameAttribute {
    ...
})
```

The properties shown above are illustrative. The actual property names and values depend on the ingestion implementation.

### Why This Model?

This structure allows the system to:

- Retrieve a specific frame.
- Inspect all attributes associated with a frame.
- Traverse from a video to its frames.
- Retrieve evidence across multiple frames.
- Support graph-based investigation queries.

---

## Cypher Queries

The following queries assume the graph structure and `frame_id` property described above.

### 1. Retrieve One Frame

```cypher
MATCH (f:Frame {
    frame_id: "CCTV_Feed_2_frame_000003"
})
RETURN f
```

### 2. Retrieve a Frame and All Its Attribute Nodes

```cypher
MATCH (f:Frame {
    frame_id: "CCTV_Feed_2_frame_000003"
})
OPTIONAL MATCH (f)-[r:HAS_ATTRIBUTE]->(a:FrameAttribute)
RETURN f, r, a
```

This query returns the frame, its relationships, and every connected attribute node. It is useful for graph visualization.

`OPTIONAL MATCH` ensures the frame can still be returned if no attribute relationship exists.

### 3. Retrieve Frame and Attribute Properties

```cypher
MATCH (f:Frame {
    frame_id: "CCTV_Feed_2_frame_000003"
})
OPTIONAL MATCH (f)-[:HAS_ATTRIBUTE]->(a:FrameAttribute)
RETURN
    properties(f) AS frame,
    collect(properties(a)) AS attributes
```

### 4. Retrieve Frames Connected to a Video

```cypher
MATCH (v:Video)-[:HAS_FRAME]->(f:Frame)
RETURN v, f
LIMIT 25
```

### 5. Traverse the Video, Frame, and Attribute Graph

```cypher
MATCH (v:Video)-[:HAS_FRAME]->(f:Frame)
OPTIONAL MATCH (f)-[:HAS_ATTRIBUTE]->(a:FrameAttribute)
RETURN v, f, a
LIMIT 100
```

### 6. Inspect a Sample of Frames

```cypher
MATCH (f:Frame)
RETURN f
LIMIT 10
```

### 7. Count Frame Nodes

```cypher
MATCH (f:Frame)
RETURN count(f) AS frame_count
```

### 8. Count Attribute Nodes

```cypher
MATCH (a:FrameAttribute)
RETURN count(a) AS attribute_count
```

### 9. Inspect All Properties of One Frame

```cypher
MATCH (f:Frame {
    frame_id: "CCTV_Feed_2_frame_000003"
})
RETURN properties(f) AS frame_properties
```

### Graph Algorithms

The documented core workflow relies on Cypher pattern matching and graph traversal. Specialized graph algorithms such as community detection or PageRank should only be listed as dependencies if they are actually used by the implementation.

Reference: [FalkorDB Cypher Documentation](https://docs.falkordb.com/cypher/)

---

## Prerequisites

Before setting up ArgusGraph, install:

- Python compatible with the backend dependencies.
- Node.js and npm, or the package manager specified by the frontend lockfile.
- Docker, if running FalkorDB locally.
- Git.
- Gemini API credentials for the configured Gemini integrations.
- Dependencies and model weights required by the video inference pipeline.
- Sufficient RAM or GPU memory for the configured vision models.

Start with a short video while validating the environment.

## Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/Adidem23/Drone_agent.git
cd Drone_agent
```

Use the repository that contains your current ArgusGraph application if its code is maintained separately. The URL above is the related project repository provided during development.

### 2. Start FalkorDB

If Docker is installed, you can start a local FalkorDB container:

```bash
docker run --name argusgraph-falkordb \
  -p 6379:6379 \
  -p 3000:3000 \
  -v falkordb-data:/var/lib/falkordb/data \
  falkordb/falkordb
```

Keep the database running while the backend and MCP server use it.

If you already have a running FalkorDB instance, use its existing connection details instead.

Documentation: [FalkorDB Setup](https://docs.falkordb.com/)

### 3. Set Up the Python Environment

Navigate to the backend directory containing `requirements.txt`.

**Windows PowerShell:**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
pip install -r requirements.txt
```

**Linux/macOS:**

```bash
python3 -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip
pip install -r requirements.txt
```

If the backend uses a different dependency file, follow the actual project structure.

### 4. Configure Environment Variables

Create the environment file expected by your backend and MCP server.

Example configuration:

```dotenv
GEMINI_API_KEY=your_gemini_api_key

FALKORDB_HOST=localhost
FALKORDB_PORT=6379
FALKORDB_PASSWORD=
FALKORDB_GRAPH_NAME=argusgraph
```

These are example names and values. Replace them with the exact environment variables expected by your code.

**Important:**

- Never commit API keys or passwords.
- Ensure the ingestion pipeline and MCP server connect to the intended FalkorDB instance.
- Ensure both components use the correct graph name.
- Follow the actual configuration for hosted databases or alternative authentication methods.

### 5. Configure Video Inference

Follow the existing inference pipeline's setup instructions for its vision models and dependencies.

Verify that:

- The configured YOLO weights are available if YOLO is enabled.
- BLIP can load its captioning model.
- CLIP can load its image-embedding model.
- Gemini credentials are valid.
- The configured output directory is writable.
- The pipeline can create its structured inference artifacts.

Preserve the existing video-processing and graph-ingestion logic when integrating it with FastAPI.

### 6. Install Frontend Dependencies

Navigate to the frontend directory containing `package.json`:

```bash
npm install
```

If the project uses a `pnpm-lock.yaml` or `yarn.lock` file, use the corresponding package manager instead.

Configure the frontend API base URL according to the environment variable expected by the application. The default local FastAPI address is often `http://localhost:8000`, but verify the actual port and configuration.

---

## Running the Application

Run each service in a separate terminal.

### 1. Start FalkorDB

Start the local container or confirm that your hosted FalkorDB instance is reachable.

### 2. Start the MCP Server

Run the MCP server using the entry point configured in your project.

Confirm that:

- The server starts without errors.
- Its FalkorDB connection settings are correct.
- Its graph-query tools are registered.
- The configured MCP client can connect to it.

The exact command depends on the MCP server module and transport configured in the repository.

### 3. Start the FastAPI Backend

If your application exposes an `app` instance in `main.py`, use:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Run this command from the directory containing `main.py`.

Adjust the module path and application name if your code uses a different entry point.

### 4. Start the Frontend

Navigate to the frontend directory:

```bash
npm run dev
```

Open the local URL printed by the Next.js development server.

Confirm that the frontend can reach FastAPI.

### 5. Run a Test Investigation

1. Upload a short CCTV video.
2. Wait for video sampling and inference to complete.
3. Confirm that the expected inference artifacts are generated.
4. Query FalkorDB to inspect the ingested frame nodes.
5. Retrieve a frame and its connected attributes.
6. Ask a natural-language question about an activity in the video.
7. Check that the agent's response references relevant frame IDs and timestamps.
8. Inspect the graph visualization and select nodes to view their properties.

---

## How It Works

The end-to-end workflow is:

1. The user uploads video footage through the frontend.
2. FastAPI initiates the existing video inference pipeline.
3. Adaptive sampling selects frames for analysis.
4. BLIP, CLIP, and Gemini perform their configured inference tasks.
5. Structured frame and attribute information is prepared for ingestion.
6. The graph ingestion process creates the graph in FalkorDB.
7. The user submits a natural-language investigation query.
8. The agent uses MCP tools to retrieve relevant graph evidence through Cypher.
9. The agent assembles a response using the retrieved observations.
10. The frontend displays the findings and enables graph exploration.

The investigation agent and inference pipeline serve different purposes: one indexes video evidence, while the other queries and interprets the resulting graph.

## Project Artifacts

Depending on the configured pipeline, outputs may include:

| Artifact | Purpose |
|---|---|
| `argusgraph_index.json` | Structured frame-level index or inference records. |
| `gemini_scenes.json` | Gemini scene descriptions when generated successfully. |
| `.npz` embedding files | Persisted visual embedding arrays when enabled. |
| FalkorDB graph | Connected video, frame, and frame-attribute records. |

Verify the output paths and filenames in the implementation. Do not assume embeddings are stored inside FalkorDB unless the ingestion code explicitly does so.

---

## Troubleshooting

### Raw Markdown Appears in the UI

If the frontend displays `\##`, `\*`, or `\*\*`, inspect the raw API response.

- Check whether backslashes are introduced by the model, backend serialization, or frontend processing.
- Render the response using a Markdown renderer.
- Avoid blindly removing all backslashes, since they may be meaningful in code or other text.

### Gemini Scene Descriptions Are Missing

Check the inference logs for:

- API quota or resource-exhaustion errors.
- Model initialization failures.
- Skipped scene-analysis stages.
- Invalid or incomplete model responses.

The agent may still answer using stored captions and detections, but the evidence may be less complete.

### Frame Queries Return No Results

- Confirm that the video was ingested into the expected graph.
- Verify the frame label and exact property name.
- Check whether the identifier is stored as `frame_id` or another property.
- Confirm the relationship direction and relationship type.

Try:

```cypher
MATCH (f:Frame)
RETURN f
LIMIT 5
```

### MCP Connection Resets

A connection-reset message alone does not prove the MCP server crashed.

Check:

- Whether the original request completed.
- Whether the client disconnected.
- Whether subsequent tool calls succeed.
- The full traceback and server logs.

### Video Inference Runs Out of Memory

Start with a shorter clip and inspect the model's memory requirements. Adjust the existing pipeline configuration only after evaluating how changes affect frame coverage and evidence quality.

---

## Responsible Use

ArgusGraph is an evidence-navigation and investigation aid. It should not be treated as an automatic determination of identity, intent, or guilt.

The system should:

- Ground findings in relevant frames and timestamps.
- Distinguish direct observations from interpretations.
- Avoid unsupported claims about identity or intent.
- Preserve the provenance of retrieved evidence.
- Restrict access to authorized footage.
- Handle video data in accordance with applicable privacy and data-protection requirements.

## Future Improvements

Potential improvements include:

- More robust temporal association between observations across frames.
- Better retry and resource handling for scene-description requests.
- Evidence cards with frame previews and timestamp navigation.
- More extensive testing of ingestion, MCP tools, and graph-query correctness.
- Evaluation datasets for evidence retrieval and answer grounding.
- More detailed graph exploration and node-inspection capabilities.

These are potential improvements, not claims that all of them are currently implemented.

## Demo

Watch the project walkthrough:

**[ArgusGraph — Demo Video](https://youtu.be/YAU1LjTdET8?si=FkvikBKzJF_ssnDN)**

## References

- [FalkorDB Documentation](https://docs.falkordb.com/)
- [FalkorDB Cypher MATCH](https://docs.falkordb.com/cypher/match/)
- [FalkorDB Cypher OPTIONAL MATCH](https://docs.falkordb.com/cypher/optional-match/)
- [Project Repository](https://github.com/Adidem23/Drone_agent)
