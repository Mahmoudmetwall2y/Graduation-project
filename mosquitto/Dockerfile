FROM eclipse-mosquitto:2.0

# Copy configuration
COPY config/mosquitto.conf /mosquitto/config/mosquitto.conf

# Generate password file with default credentials
# In production, mount an external password file instead
RUN mosquitto_passwd -b -c /mosquitto/config/passwd asculticor asculticor123 && \
    chmod 0700 /mosquitto/config/passwd && \
    chown mosquitto:mosquitto /mosquitto/config/passwd

# Expose ports
EXPOSE 1883 9001

# Run mosquitto
CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]