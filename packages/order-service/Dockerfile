FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/order-service/package.json ./packages/order-service/
COPY packages/order-service/tsconfig.json ./packages/order-service/

RUN npm install --workspace=packages/order-service --workspace=packages/shared

COPY packages/shared/ ./packages/shared/
COPY packages/order-service/ ./packages/order-service/
COPY scripts/ ./scripts/

RUN npm run build --workspace=packages/order-service

EXPOSE 4004
USER node
CMD ["node", "packages/order-service/dist/index.js"]
