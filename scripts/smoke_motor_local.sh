#!/bin/bash

# Configuration
IMAGE_NAME="scankey-motor-local:latest"
CONTAINER_NAME="scankey-motor-test-$(date +%s)"
HEALTH_CHECK_URL="http://127.0.0.1:8080/health"
MOTOR_DIR="/home/guille3056swatch/WORK/scankey/app/scankey-v1a1/motor"
SCRIPTS_DIR="/home/guille3056swatch/WORK/scankey/app/scankey-v1a1/scripts"
MAX_RETRIES=20
RETRY_INTERVAL=3
SKIP_MODEL=${SKIP_MODEL:-0} # Default to 0, set to 1 to skip model check

echo "--- Starting local motor smoke test ---"

# Build Docker image
echo "Building Docker image: $IMAGE_NAME from $MOTOR_DIR"
docker build -t "$IMAGE_NAME" "$MOTOR_DIR"
if [ $? -ne 0 ]; then
    echo "ERROR: Docker image build failed."
    exit 1
fi

# Run container
echo "Running container: $CONTAINER_NAME"
docker run -d -p 8080:8080 --name "$CONTAINER_NAME" "$IMAGE_NAME"
if [ $? -ne 0 ]; then
    echo "ERROR: Docker container failed to start."
    docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1
    exit 1
fi

echo "Container started. Waiting for health endpoint at $HEALTH_CHECK_URL"

# Health check with retries
for i in $(seq 1 $MAX_RETRIES); do
    HEALTH_RESPONSE=$(curl -s -4 "$HEALTH_CHECK_URL")
    CURL_EXIT_CODE=$?

    if [ "$CURL_EXIT_CODE" -eq 0 ]; then
        if [ "$SKIP_MODEL" -eq 1 ]; then
            echo "Health check succeeded (model check skipped):"
            echo "$HEALTH_RESPONSE" | jq .
            break
        else
            if echo "$HEALTH_RESPONSE" | jq -e '.ok == true' > /dev/null; then
                echo "Health check succeeded:"
                echo "$HEALTH_RESPONSE" | jq .
                break
            fi
        fi
    fi

    echo "Attempt $i/$MAX_RETRIES: Health check failed (exit code $CURL_EXIT_CODE). Retrying in $RETRY_INTERVAL seconds..."
    sleep $RETRY_INTERVAL
done

# Check if health check passed
if [ $i -gt $MAX_RETRIES ]; then
    echo "ERROR: Health check failed after $MAX_RETRIES attempts."
    echo "--- Docker Logs (tail 200) for $CONTAINER_NAME ---"
    docker logs --tail 200 "$CONTAINER_NAME"
    docker stop "$CONTAINER_NAME" > /dev/null 2>&1
    docker rm "$CONTAINER_NAME" > /dev/null 2>&1
    exit 1
fi

echo "--- Local motor smoke test finished successfully ---"

# Clean up
docker stop "$CONTAINER_NAME" > /dev/null 2>&1
docker rm "$CONTAINER_NAME" > /dev/null 2>&1

exit 0
