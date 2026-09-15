FROM node:20-alpine

WORKDIR /app

# Copy root package files
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api-gateway/package.json ./packages/api-gateway/

# Install dependencies
RUN npm install --workspace=packages/api-gateway --workspace=packages/shared

# Copy source
COPY packages/shared/ ./packages/shared/
COPY packages/api-gateway/ ./packages/api-gateway/

EXPOSE 4000

USER node

CMD ["npx", "tsx", "packages/api-gateway/src/index.ts"]
