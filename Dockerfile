# Build

FROM node:12.18 AS build

WORKDIR /app

COPY . /app

RUN yarn install

RUN npm run build

RUN cp package.json build/

RUN yarn install --prod --modules-folder build/node_modules

# Production

FROM node:12.18-buster-slim

COPY --from=build /app/build  /app

WORKDIR /app

CMD ["node", "index.js"]
