# ChatRuka Pipecat voice server — Railway / Docker
FROM python:3.11-slim-bookworm

# Pipecat SmallWebRTC imports cv2 even for audio-only; opencv-python needs X11 libs on Linux.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxcb1 \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

ENV PIPECAT_HOST=0.0.0.0

EXPOSE 8080

CMD ["uv", "run", "bot.py"]
