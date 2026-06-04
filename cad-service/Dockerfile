# ToolTwin CAD service — deploy to Render with:
#   Runtime: Docker
#   Root Directory: cad-service
#   Dockerfile Path: ./Dockerfile   (build context = cad-service/)
FROM python:3.11-slim

# OCCT (cadquery-ocp) needs a handful of X/GL shared libs at import time even
# though we render nothing — this is the minimal set.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglu1-mesa \
        libxrender1 \
        libxext6 \
        libsm6 \
        libxi6 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first for layer caching.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# App code + recipes.
COPY . /app

EXPOSE 8000
# Render injects $PORT; default to 8000 for local `docker run`.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
