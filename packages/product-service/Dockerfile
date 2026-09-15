FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/product-service/package.json ./packages/product-service/
COPY packages/product-service/tsconfig.json ./packages/product-service/

RUN npm install --workspace=packages/product-service --workspace=packages/shared

COPY packages/shared/ ./packages/shared/
COPY packages/product-service/ ./packages/product-service/

RUN npm run build --workspace=packages/shared && npm run build --workspace=packages/product-service

EXPOSE 4002
USER node
CMD ["node", "packages/product-service/dist/index.js"]
