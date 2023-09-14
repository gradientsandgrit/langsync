FROM node:18.17.1-alpine3.18 AS build

WORKDIR /app

RUN npm i -g pnpm

COPY package.json pnpm-lock.yaml /app/

RUN pnpm i

COPY . .

FROM node:18.17.1-alpine3.18

RUN apk add openssh ca-certificates

RUN npm i -g pnpm

COPY --from=build /app /app

WORKDIR /app

ARG commit_sha=unknown
ENV BUILD_COMMIT_SHA=$commit_sha

CMD pnpm run start
