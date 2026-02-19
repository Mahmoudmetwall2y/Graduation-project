FROM eclipse-mosquitto:2.0

# Copy configuration
COPY config/mosquitto.conf /mosquitto/config/mosquitto.conf
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh

# Expose ports
EXPOSE 1883 9001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
