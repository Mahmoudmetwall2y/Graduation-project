FROM eclipse-mosquitto:2.0

# Copy configuration and startup entrypoint
COPY config/mosquitto.conf /mosquitto/config/mosquitto.conf
COPY config/acl            /mosquitto/config/acl
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh

# Normalize line endings + ensure executable bit inside image
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
    && chmod 0755 /usr/local/bin/entrypoint.sh \
    && test -x /usr/local/bin/entrypoint.sh

# Expose ports
EXPOSE 1883 9001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
