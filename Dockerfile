FROM node:20-slim

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src ./src

# Build
RUN npm run build

# Create directories
RUN mkdir -p data groups auth_info_baileys

# Environment variables
ENV NODE_ENV=production
ENV OLLAMA_BASE_URL=http://host.docker.internal:11434

CMD ["npm", "start"]
