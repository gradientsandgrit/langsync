# expects repository root context

FROM golang:1.21.1-alpine3.18 AS build

WORKDIR /langsync/services/worker

COPY go.mod go.sum ./

RUN go mod download

COPY . ./

RUN go build -o worker .

FROM golang:1.21.1-alpine3.18

WORKDIR /app

RUN apk add openssh ca-certificates

COPY --from=build /langsync/services/worker/worker ./worker

ARG commit_sha=unknown
ENV BUILD_COMMIT_SHA=$commit_sha

CMD ./worker
