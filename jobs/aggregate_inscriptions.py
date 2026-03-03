import os
import json
import datetime
import time
import re
from collections import defaultdict, Counter
from google.cloud import storage

# Assume common.catalog_match is available
from common import catalog_match

INSCRIPTIONS_BUCKET = os.getenv("INSCRIPTIONS_BUCKET")
if not INSCRIPTIONS_BUCKET:
    print("INSCRIPTIONS_BUCKET environment variable not set. Exiting.")
    exit(1)

CHECKPOINT_OBJ = "inscriptions/index/checkpoint.json"
INDEX_OBJ = "inscriptions/index/inscriptions_index.json"
EVENTS_PREFIX = "inscriptions/events/"

def _read_gcs_json(bucket_name: str, object_name: str, default_value=None):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(object_name)
    try:
        data = blob.download_as_text()
        return json.loads(data)
    except Exception as e:
        if default_value is not None:
            return default_value
        raise RuntimeError(f"Failed to read GCS object gs://{bucket_name}/{object_name}: {e}") from e

def _write_gcs_json(bucket_name: str, object_name: str, data: dict):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(object_name)
    blob.upload_from_string(json.dumps(data, ensure_ascii=False, indent=2), content_type="application/json")

def _safe_write_gcs_json_atomic(bucket_name: str, object_name: str, data: dict):
    # Write to a temporary object first, then overwrite the target
    temp_object_name = f"{object_name}.tmp_{int(time.time())}"
    _write_gcs_json(bucket_name, temp_object_name, data)
    
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    
    # Compose operation (effectively an atomic rename for a single object)
    # If the destination object exists, it will be overwritten.
    # We compose the temporary object onto itself to effectively rename/overwrite.
    blob_temp = bucket.blob(temp_object_name)
    blob_target = bucket.blob(object_name)
    
    blob_target.compose([blob_temp])
    blob_temp.delete() # Clean up temporary object

def main():
    print(f"Starting aggregation for bucket: {INSCRIPTIONS_BUCKET}")
    
    last_processed_timestamp = _read_gcs_json(INSCRIPTIONS_BUCKET, CHECKPOINT_OBJ, {"last_timestamp": 0}).get("last_timestamp", 0)
    print(f"Last processed timestamp: {last_processed_timestamp}")

    client = storage.Client()
    
    new_events = []
    max_event_timestamp = last_processed_timestamp

    # List new events from GCS
    # Iterate through current day and previous day for robustness
    today_str = datetime.datetime.utcnow().strftime("%Y/%m/%d")
    yesterday_str = (datetime.datetime.utcnow() - datetime.timedelta(days=1)).strftime("%Y/%m/%d")

    prefixes_to_check = [f"{EVENTS_PREFIX}{today_str}/"]
    if today_str != yesterday_str: # Avoid checking twice on same day if time rolls over midnight quickly
        prefixes_to_check.append(f"{EVENTS_PREFIX}{yesterday_str}/")

    for prefix in prefixes_to_check:
        blobs = client.list_blobs(INSCRIPTIONS_BUCKET, prefix=prefix)
        for blob in blobs:
            # Extract timestamp from blob name (e.g., 1709289600_inputid.json)
            match = re.search(r"/(\d+)_", blob.name)
            if match:
                event_timestamp = int(match.group(1))
                if event_timestamp > last_processed_timestamp:
                    try:
                        event_data = _read_gcs_json(INSCRIPTIONS_BUCKET, blob.name)
                        if event_data and event_data.get("inscription_norm"):
                            new_events.append(event_data)
                            max_event_timestamp = max(max_event_timestamp, event_timestamp)
                        print(f"Processed new event: {blob.name}")
                    except Exception as e:
                        print(f"Error reading event {blob.name}: {e}")
            else:
                print(f"Skipping blob {blob.name}: could not parse timestamp.")

    print(f"Found {len(new_events)} new events. Max event timestamp: {max_event_timestamp}")

    if not new_events:
        print("No new events to process.")
        return

    # Load current index
    current_index = _read_gcs_json(INSCRIPTIONS_BUCKET, INDEX_OBJ, {"suggestions": []})
    
    # Process events
    inscription_data = defaultdict(lambda: {"seen": 0, "top_refs": Counter()})

    # Populate with existing index data
    for s in current_index.get("suggestions", []):
        text = s.get("text")
        if text:
            inscription_data[text]["seen"] = s.get("seen", 0)
            inscription_data[text]["top_refs"] = Counter({ref[0]: ref[1] for ref in s.get("top_refs", [])})

    for event in new_events:
        inscription_norm = event.get("inscription_norm")
        ref_final_canon = event.get("ref_final_canon")
        
        if inscription_norm and ref_final_canon:
            inscription_data[inscription_norm]["seen"] += 1
            inscription_data[inscription_norm]["top_refs"][ref_final_canon] += 1
    
    # Build new index
    new_suggestions = []
    for text, data in inscription_data.items():
        top_refs_list = data["top_refs"].most_common(5) # top 5 refs
        new_suggestions.append({
            "text": text,
            "seen": data["seen"],
            "top_refs": top_refs_list
        })
    
    # Sort suggestions: most seen first, then alphabetical
    new_suggestions.sort(key=lambda x: (-x["seen"], x["text"]))

    new_index = {"suggestions": new_suggestions}

    # Write new index atomically
    _safe_write_gcs_json_atomic(INSCRIPTIONS_BUCKET, INDEX_OBJ, new_index)
    print(f"Successfully wrote new index to gs://{INSCRIPTIONS_BUCKET}/{INDEX_OBJ}")

    # Update checkpoint
    _write_gcs_json(INSCRIPTIONS_BUCKET, CHECKPOINT_OBJ, {"last_timestamp": max_event_timestamp})
    print(f"Updated checkpoint to {max_event_timestamp}")

if __name__ == "__main__":
    main()
