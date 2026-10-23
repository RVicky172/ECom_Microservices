FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/assistant-service/package.json ./packages/assistant-service/
COPY packages/assistant-service/tsconfig.json ./packages/assistant-service/

RUN npm install --workspace=packages/assistant-service --workspace=packages/shared

COPY packages/shared/ ./packages/shared/
COPY packages/assistant-service/ ./packages/assistant-service/

RUN npm run build --workspace=packages/shared && npm run build --workspace=packages/assistant-service

EXPOSE 4008
USER node
CMD ["node", "packages/assistant-service/dist/index.js"]
