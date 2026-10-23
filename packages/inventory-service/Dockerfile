FROM node:26-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/inventory-service/package.json ./packages/inventory-service/
COPY packages/inventory-service/tsconfig.json ./packages/inventory-service/

RUN npm install --workspace=packages/inventory-service --workspace=packages/shared

COPY packages/shared/ ./packages/shared/
COPY packages/inventory-service/ ./packages/inventory-service/

RUN npm run build --workspace=packages/shared && npm run build --workspace=packages/inventory-service

EXPOSE 4005
USER node
CMD ["node", "packages/inventory-service/dist/index.js"]
