FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/payment-service/package.json ./packages/payment-service/
COPY packages/payment-service/tsconfig.json ./packages/payment-service/

RUN npm install --workspace=packages/payment-service --workspace=packages/shared

COPY packages/shared/ ./packages/shared/
COPY packages/payment-service/ ./packages/payment-service/

RUN npm run build --workspace=packages/payment-service

EXPOSE 4006
USER node
CMD ["node", "packages/payment-service/dist/index.js"]
