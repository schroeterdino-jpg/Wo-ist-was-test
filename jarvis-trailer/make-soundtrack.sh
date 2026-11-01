#!/usr/bin/env bash
set -euo pipefail
mkdir -p public
ffmpeg -y -f lavfi -i "sine=frequency=55:duration=80:sample_rate=48000" -f lavfi -i "sine=frequency=110:duration=80:sample_rate=48000" -f lavfi -i "anoisesrc=color=pink:duration=80:sample_rate=48000" -filter_complex "[0:a]volume=0.055,lowpass=f=180[a0];[1:a]volume=0.018,tremolo=f=0.16:d=0.5[a1];[2:a]volume=0.006,lowpass=f=900[a2];[a0][a1][a2]amix=inputs=3:duration=longest,afade=t=in:st=0:d=2,afade=t=out:st=77:d=3,volume=0.8" public/soundtrack.wav
