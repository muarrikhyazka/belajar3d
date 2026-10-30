FROM node:20-alpine AS webbuild
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM golang:1.23-alpine AS build
WORKDIR /src
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download
COPY backend-go/ .
RUN CGO_ENABLED=0 go build -o /app/server .

FROM alpine:3.19
WORKDIR /app
COPY --from=build /app/server ./server
COPY backend-go/schema.sql ./schema.sql
COPY --from=webbuild /web/dist ./static
EXPOSE 5020
CMD ["./server"]
