import os
import json
import glob
from flask import Flask, jsonify, request, send_from_directory, abort

app = Flask(__name__, static_folder="static", static_url_path="/static")

BASE_DIR = os.path.join(os.path.dirname(__file__), "dataset_for_rider_website")

SPLIT_MAP = {
    "train": "train_dataset",
    "val": "val_dataset",
    "test": "test_dataset",
}


def get_tracks_dir(split):
    folder = SPLIT_MAP.get(split)
    if not folder:
        return None
    return os.path.join(BASE_DIR, folder, "tracks")


def get_videos_dir(split):
    folder = SPLIT_MAP.get(split)
    if not folder:
        return None
    return os.path.join(BASE_DIR, folder, "videos")


# ─── Serve the SPA ────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ─── Serve crop images ────────────────────────────────────────────────────────

@app.route("/images/<split>/<video_name>/<filename>")
def serve_image(split, video_name, filename):
    videos_dir = get_videos_dir(split)
    if not videos_dir:
        abort(404)
    video_dir = os.path.join(videos_dir, video_name)
    if not os.path.isdir(video_dir):
        abort(404)
    return send_from_directory(video_dir, filename)


# ─── API: GET /api/tracks ─────────────────────────────────────────────────────

@app.route("/api/tracks")
def get_tracks():
    split = request.args.get("split", "train")
    tracks_dir = get_tracks_dir(split)
    if not tracks_dir or not os.path.isdir(tracks_dir):
        return jsonify({"error": f"Invalid split or missing directory: {split}"}), 400

    json_files = sorted(glob.glob(os.path.join(tracks_dir, "*.json")))
    all_videos = []
    for jf in json_files:
        try:
            with open(jf, "r") as f:
                data = json.load(f)
            all_videos.append(data)
        except Exception as e:
            print(f"Error reading {jf}: {e}")

    return jsonify(all_videos)


# ─── API: GET /api/stats ──────────────────────────────────────────────────────

@app.route("/api/stats")
def get_stats():
    split = request.args.get("split", "train")
    tracks_dir = get_tracks_dir(split)
    if not tracks_dir or not os.path.isdir(tracks_dir):
        return jsonify({"error": "Invalid split"}), 400

    total_crops = 0
    reviewed_crops = 0
    class_dist = {0: 0, 1: 0, 2: 0, 3: 0}

    json_files = glob.glob(os.path.join(tracks_dir, "*.json"))
    for jf in json_files:
        try:
            with open(jf) as f:
                data = json.load(f)
            for track in data.get("tracks", []):
                for crop_name, crop in track.get("crops", {}).items():
                    total_crops += 1
                    if crop.get("reviewed"):
                        reviewed_crops += 1
                    effective = crop.get("corrected_class") if crop.get("corrected_class") is not None else crop.get("pred_class")
                    if effective in class_dist:
                        class_dist[effective] += 1
        except Exception as e:
            print(f"Error: {e}")

    return jsonify({
        "total_crops": total_crops,
        "reviewed_crops": reviewed_crops,
        "unreviewed_crops": total_crops - reviewed_crops,
        "class_distribution": class_dist,
    })


# ─── API: POST /api/update_crop_class ─────────────────────────────────────────

@app.route("/api/update_crop_class", methods=["POST"])
def update_crop_class():
    payload = request.get_json()
    if not payload:
        return jsonify({"error": "No JSON payload"}), 400

    split = payload.get("split")
    video_name = payload.get("video_name")
    track_id = payload.get("track_id")
    crop = payload.get("crop")
    corrected_class = payload.get("corrected_class")

    if None in (split, video_name, track_id, crop, corrected_class):
        return jsonify({"error": "Missing fields"}), 400

    tracks_dir = get_tracks_dir(split)
    if not tracks_dir:
        return jsonify({"error": "Invalid split"}), 400

    json_path = os.path.join(tracks_dir, f"{video_name}.json")
    if not os.path.isfile(json_path):
        return jsonify({"error": f"JSON not found: {json_path}"}), 404

    with open(json_path, "r") as f:
        data = json.load(f)

    updated = False
    for track in data.get("tracks", []):
        if track["track_id"] == track_id:
            if crop in track.get("crops", {}):
                track["crops"][crop]["corrected_class"] = corrected_class
                track["crops"][crop]["reviewed"] = True
                track["crops"][crop]["flagged"] = False
                updated = True
                break

    if not updated:
        return jsonify({"error": "Track/crop not found"}), 404

    with open(json_path, "w") as f:
        json.dump(data, f, indent=2)

    return jsonify({"success": True})


# ─── API: POST /api/review_crop ───────────────────────────────────────────────

@app.route("/api/review_crop", methods=["POST"])
def review_crop():
    payload = request.get_json()
    split = payload.get("split")
    video_name = payload.get("video_name")
    track_id = payload.get("track_id")
    crop = payload.get("crop")

    tracks_dir = get_tracks_dir(split)
    if not tracks_dir:
        return jsonify({"error": "Invalid split"}), 400

    json_path = os.path.join(tracks_dir, f"{video_name}.json")
    if not os.path.isfile(json_path):
        return jsonify({"error": "JSON not found"}), 404

    with open(json_path) as f:
        data = json.load(f)

    for track in data.get("tracks", []):
        if track["track_id"] == track_id:
            if crop in track.get("crops", {}):
                track["crops"][crop]["reviewed"] = True
                track["crops"][crop]["flagged"] = False
                break

    with open(json_path, "w") as f:
        json.dump(data, f, indent=2)

    return jsonify({"success": True})


# ─── API: POST /api/flag_crop ───────────────────────────────────────────────

@app.route("/api/flag_crop", methods=["POST"])
def flag_crop():
    payload = request.get_json()
    split = payload.get("split")
    video_name = payload.get("video_name")
    track_id = payload.get("track_id")
    crop = payload.get("crop")

    tracks_dir = get_tracks_dir(split)
    if not tracks_dir:
        return jsonify({"error": "Invalid split"}), 400

    json_path = os.path.join(tracks_dir, f"{video_name}.json")
    if not os.path.isfile(json_path):
        return jsonify({"error": "JSON not found"}), 404

    with open(json_path) as f:
        data = json.load(f)

    for track in data.get("tracks", []):
        if track["track_id"] == track_id:
            if crop in track.get("crops", {}):
                track["crops"][crop]["flagged"] = True
                track["crops"][crop]["reviewed"] = False
                break

    with open(json_path, "w") as f:
        json.dump(data, f, indent=2)

    return jsonify({"success": True})

# ─── API: POST /api/reset_crop ────────────────────────────────────────────────

@app.route("/api/reset_crop", methods=["POST"])
def reset_crop():
    payload = request.get_json()
    split = payload.get("split")
    video_name = payload.get("video_name")
    track_id = payload.get("track_id")
    crop = payload.get("crop")

    tracks_dir = get_tracks_dir(split)
    if not tracks_dir:
        return jsonify({"error": "Invalid split"}), 400

    json_path = os.path.join(tracks_dir, f"{video_name}.json")
    if not os.path.isfile(json_path):
        return jsonify({"error": "JSON not found"}), 404

    with open(json_path) as f:
        data = json.load(f)

    for track in data.get("tracks", []):
        if track["track_id"] == track_id:
            if crop in track.get("crops", {}):
                track["crops"][crop]["corrected_class"] = None
                track["crops"][crop]["reviewed"] = False
                track["crops"][crop]["flagged"] = False
                break

    with open(json_path, "w") as f:
        json.dump(data, f, indent=2)

    return jsonify({"success": True})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
