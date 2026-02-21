#!/bin/bash

# Define the base directory for scankey
SCANKY_BASE_DIR="${HOME}/WORK/scankey"

# Define the train_inbox structure
TRAIN_INBOX_DIR="${SCANKY_BASE_DIR}/train_inbox"
RAW_DIR="${TRAIN_INBOX_DIR}/RAW"
READY_DIR="${TRAIN_INBOX_DIR}/READY"
BAD_DIR="${TRAIN_INBOX_DIR}/BAD"
RECOVERABLE_DIR="${BAD_DIR}/RECOVERABLE"
AUX_DIR="${BAD_DIR}/AUX"
DEAD_DIR="${BAD_DIR}/DEAD"

# Define the datasets directory
DATASETS_V2_DIR="${SCANKY_BASE_DIR}/datasets/v2"

echo "Creating data folders under ${SCANKY_BASE_DIR}..."

# Create train_inbox directories
mkdir -p "${RAW_DIR}" || { echo "Error creating ${RAW_DIR}"; exit 1; }
mkdir -p "${READY_DIR}" || { echo "Error creating ${READY_DIR}"; exit 1; }
mkdir -p "${RECOVERABLE_DIR}" || { echo "Error creating ${RECOVERABLE_DIR}"; exit 1; }
mkdir -p "${AUX_DIR}" || { echo "Error creating ${AUX_DIR}"; exit 1; }
mkdir -p "${DEAD_DIR}" || { echo "Error creating ${DEAD_DIR}"; exit 1; }

# Create datasets directory
mkdir -p "${DATASETS_V2_DIR}" || { echo "Error creating ${DATASETS_V2_DIR}"; exit 1; }

echo "All specified data folders created successfully (or already exist)."