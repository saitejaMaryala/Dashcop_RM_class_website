# Rider Count Review Web Tool – Design Document (Updated Crop-Level Labels)

## 1. Overview

This document describes the design and requirements for a **web-based rider count review tool** used to manually verify and correct rider counts on motorcycle tracks extracted from videos.

Each motorcycle track has representative crops taken from **specific frames** (first, middle, last).
Unlike the previous design, **each crop now has its own annotation**, meaning the reviewer can label **each crop independently**.

The tool allows a reviewer to:

* Browse tracks from **train / val / test splits**
* View the representative crops
* See the **predicted rider class for each crop**
* Manually **correct the class for each crop**
* Persist corrections back to the dataset JSON

This tool is intended for **manual verification and correction of rider counts at the crop level**.

---

# 2. Dataset Structure

The dataset directory is structured as follows:

```
dataset_for_rider_website/

├── train_dataset/
│   ├── videos/
│   │   ├── video_001/
│   │   │   ├── 12_first.jpg
│   │   │   ├── 12_middle.jpg
│   │   │   └── 12_last.jpg
│   │   │
│   │   ├── video_002/
│   │   │   ├── 4_first.jpg
│   │   │   └── 4_last.jpg
│   │   │
│   │   └── ...
│   │
│   └── tracks/
│       ├── video_001.json
│       ├── video_002.json
│       └── ...
│
├── val_dataset/
│   ├── videos/
│   └── tracks/
│
├── test_dataset/
│   ├── videos/
│   └── tracks/
│
└── readme.md
```

---

# 3. Image Naming Convention

Each crop corresponds to a **track ID** and a **position within the track**.

Format:

```
<track_id>_<position>.jpg
```

Example:

```
12_first.jpg
12_middle.jpg
12_last.jpg
```

### Position Meaning

| Position | Meaning                   |
| -------- | ------------------------- |
| first    | first frame of the track  |
| middle   | middle frame of the track |
| last     | last frame of the track   |

Tracks may contain:

* only `first`
* `first + last`
* `first + middle + last`

depending on track length.

---

# 4. JSON Annotation Format (Crop-Level Labels)

Each video has a JSON file describing all tracks.
Each **track contains multiple crops**, and each **crop has its own annotation fields**.

Example file:

```
train_dataset/tracks/video_001.json
```

Example content:

```json
{
  "video_name": "video_001",
  "tracks": [
    {
      "track_id": 12,
      "length": 45,
      "crops": {
        "first": {
          "frame_number": 120,
          "num_riders": 3,
          "pred_class": 3,
          "corrected_class": null,
          "reviewed": false
        },
        "middle": {
          "frame_number": 142,
          "num_riders": 2,
          "pred_class": 2,
          "corrected_class": null,
          "reviewed": false
        },
        "last": {
          "frame_number": 165,
          "num_riders": 2,
          "pred_class": 2,
          "corrected_class": null,
          "reviewed": false
        }
      }
    }
  ]
}
```

---

# 5. Field Definitions

### Track-Level Fields

| Field      | Description                                  |
| ---------- | -------------------------------------------- |
| `track_id` | Unique motorcycle track ID within the video  |
| `length`   | Total number of frames in the track          |
| `crops`    | Dictionary containing crop-level annotations |

---

### Crop-Level Fields

Each crop (`first`, `middle`, `last`) contains:

| Field             | Description                                       |
| ----------------- | ------------------------------------------------- |
| `frame_number`    | Frame index in the video where the crop was taken |
| `num_riders`      | Number of detected riders in that frame           |
| `pred_class`      | Automatically predicted rider class               |
| `corrected_class` | Manually corrected class                          |
| `reviewed`        | Whether this crop has been reviewed               |

---

# 6. Rider Class Definitions

Rider count classes:

| Class | Meaning              |
| ----- | -------------------- |
| 0     | No riders            |
| 1     | Single rider         |
| 2     | Two riders           |
| 3     | Three or more riders |

In the UI the class **3** should be displayed as:

```
≥3
```

---

# 7. Website Requirements

## 7.1 Split Selector

At the top of the page there should be a **dropdown menu**:

```
[ train | val | test ]
```

Switching the split loads data from:

```
train_dataset
val_dataset
test_dataset
```

---

# 7.2 Track Display

Each track should appear as a **card**.

Example:

```
-----------------------------------
Video: video_001
Track ID: 12

[first crop]
[middle crop]
[last crop]

-----------------------------------
```

Each crop should be displayed **individually with its metadata**.

---

# 7.3 Crop Display Layout

Each crop section should contain:

* crop image
* frame number
* predicted class
* corrected class
* correction buttons

Example:

```
Crop: first
Frame: 120

[image]

Predicted class: 3
Corrected class: None

[0] [1] [2] [≥3]
```

Another example:

```
Crop: middle
Frame: 142

[image]

Predicted class: 2
Corrected class: None

[0] [1] [2] [≥3]
```

---

# 7.4 Image Path Resolution

Images are located at:

```
/videos/<video_name>/<track_id>_<position>.jpg
```

Example:

```
videos/video_001/12_first.jpg
```

The UI should dynamically load images depending on which crops exist inside the `crops` dictionary.

---

# 7.5 Correction Interface

Users can correct the rider class using buttons:

```
[0] [1] [2] [≥3]
```

When a button is clicked:

1. `corrected_class` for that crop is updated
2. `reviewed` is set to `true`
3. The JSON file is updated on disk

Example updated crop:

```json
"middle": {
  "frame_number": 142,
  "num_riders": 2,
  "pred_class": 2,
  "corrected_class": 1,
  "reviewed": true
}
```

---

# 8. Backend Responsibilities

The backend should expose APIs to read and update annotations.

---

## 8.1 Get Tracks

Endpoint:

```
GET /tracks?split=train
```

Returns:

* video name
* track IDs
* crop metadata

---

## 8.2 Update Corrected Class

Endpoint:

```
POST /update_crop_class
```

Payload:

```json
{
  "split": "train",
  "video_name": "video_001",
  "track_id": 12,
  "crop": "middle",
  "corrected_class": 1
}
```

Server should:

1. Load the JSON file
2. Update the specified crop
3. Set `reviewed = true`
4. Save the JSON file

---

# 9. Frontend Behavior

The frontend should:

1. Load tracks for the selected split
2. Render track cards
3. Render crops dynamically based on the `crops` dictionary
4. Allow per-crop correction
5. Send updates to the backend
6. Update the UI immediately after correction

---

# 10. Suggested Tech Stack

Frontend:

* HTML 
* CSS
* JAVA Script

Backend:

* FastAPI (recommended) or Flask

Static Files:

* Serve crop images directly from the dataset directory.

---

# 11. Optional Improvements

Possible improvements:

* Show **review progress**
* Filter **unreviewed crops**
* Keyboard shortcuts for faster annotation
* Jump to next unreviewed crop
* Show statistics (class distribution)

---

# 12. Goal

The goal of the system is to enable **fast, accurate verification of rider counts for individual frames** extracted from motorcycle tracks, improving dataset quality for **multi-rider detection tasks**.
