FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/cart-service/package.json ./packages/cart-service/
COPY packages/cart-service/tsconfig.json ./packages/cart-service/

RUN npm install --workspace=packages/cart-service --workspace=packages/shared

COPY packages/shared/ ./packages/shared/
COPY packages/cart-service/ ./packages/cart-service/

RUN npm run build --workspace=packages/cart-service

EXPOSE 4003
USER node
CMD ["node", "packages/cart-service/dist/index.js"]
