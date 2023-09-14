# Use a smaller base image and label the build stage
FROM python:3.11.5-slim-bookworm AS build

# Install system dependencies and Rust
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc musl-dev libffi-dev libssl-dev git g++ make && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Set environment variables
ENV PATH="/root/.cargo/bin:${PATH}"

# Create a virtual environment and install dependencies
WORKDIR /langsync/services/python-helper

COPY requirements.txt ./

RUN python -m venv venv

RUN venv/bin/pip install --no-cache-dir -r requirements.txt

# Final stage with a smaller base image
FROM python:3.11.5-slim-bookworm

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    openssh-client ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory and copy the virtual environment
WORKDIR /app
COPY --from=build /langsync/services/python-helper/venv ./venv

# Copy your application code
COPY main.py moderation.py wsgi.py ./

# Set environment variables
ARG commit_sha=unknown
ENV BUILD_COMMIT_SHA=$commit_sha

CMD venv/bin/python -m gunicorn -w 4 -b 0.0.0.0:8082 wsgi:app