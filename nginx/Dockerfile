FROM nginx:alpine

# Copy the envsubst-ready server template
COPY default.conf.template /etc/nginx/templates/default.conf.template

# Create certs directory for self-signed SSL (mount or generate at build)
RUN mkdir -p /etc/nginx/certs

# Generate self-signed certificate for local development
RUN apk add --no-cache openssl && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/nginx/certs/selfsigned.key \
      -out /etc/nginx/certs/selfsigned.crt \
      -subj "/CN=localhost" && \
    apk del openssl

EXPOSE 80 443
