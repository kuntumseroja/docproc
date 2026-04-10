# Stage 1: Build React app
FROM node:20-alpine AS builder

# Install build dependencies for native npm packages (sass, etc.)
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY frontend/ .

# Copy pdfjs worker to public for runtime PDF text extraction
RUN cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/ 2>/dev/null || true

ARG REACT_APP_API_URL=/api/v1
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:1.25-alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
