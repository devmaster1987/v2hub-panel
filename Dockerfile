FROM python:3.12-slim

WORKDIR /app

# System deps (qrcode needs Pillow which needs libjpeg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY src/ ./src/
COPY frontend/ ./frontend/
COPY run.py ./

# Set PYTHONPATH so 'from app.xxx' resolves correctly
ENV PYTHONPATH=/app/src

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", "--log-level", "info", "--no-access-log"]
