"""Camera pipeline (to build): ArUco page registration, ink gate, line crops, hand tracking.

Plan, from docs/spec.md sections 5.1 to 5.3:
  page.py   detect the 4 ArUco markers, cv2.findHomography, warp to a flat page;
            keep the last good homography while the hand covers a marker
  ink.py    adaptive threshold, new ink = ink now AND NOT stable ink, minus the hand mask;
            a line is finished when new ink is still for ~1.2 s and the hand has moved away
  hands.py  MediaPipe Hands; index fingertip (landmark 8) mapped through the homography
  stream.py MJPEG at /video.mjpg for the web app; marks are sent in camera coordinates

Install with `uv sync --extra vision`. When this module can open the camera, the server's
hello message sets camera=true and the web app switches from the drawn sheet to video.
"""
