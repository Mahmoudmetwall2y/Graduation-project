import sys

with open('firmware/asculticor_esp32/AscultiCor_esp32.ino', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'void startSession()' in line:
        lines[i] = 'void startSession(const char* new_session_id = nullptr) {\n  if (new_session_id) {\n    strlcpy(session_id, new_session_id, sizeof(session_id));\n  } else {\n    generateUUID(session_id);\n  }\n'
    elif 'generateUUID(session_id);' in line and i > 770 and i < 800:
        lines[i] = '' # We already appended it
    elif 'Serial.println("[MQTT] Stop requested' in line:
        lines[i] = '    Serial.println("[MQTT] Stop requested");\n'
    elif '  } else if (strcmp(command, "stop") == 0 && isStreaming) {' in line:
        # Check if we already inserted
        if 'start' not in "".join(lines[i:i+10]):
            lines[i] += '    // placeholder\n'
            # We will insert later to avoid index shift issues inside loop
    elif '  if (!isStreaming && mqtt.connected()) {' in line:
        lines[i] = '  // if (!isStreaming && mqtt.connected()) {\n'
        lines[i+1] = '  //   startSession();\n'
        lines[i+2] = '  // }\n'

i = 0
while i < len(lines):
    if '  } else if (strcmp(command, "stop") == 0 && isStreaming) {' in lines[i]:
        # we know it ends 3 lines down
        start_handler = '  } else if (strcmp(command, "start") == 0 && !isStreaming) {\n    const char *new_session_id = doc["session_id"];\n    if (new_session_id) {\n      Serial.printf("[MQTT] Start requested for session: %s\\n", new_session_id);\n      startSession(new_session_id);\n    } else {\n      Serial.println("[MQTT] Start requested but no session_id provided.");\n    }\n'
        if 'start_session' not in "".join(lines[i:i+15]):
            lines.insert(i+4, start_handler)
        break
    i += 1

with open('firmware/asculticor_esp32/AscultiCor_esp32.ino', 'w', encoding='utf-8') as f:
    f.writelines(lines)
