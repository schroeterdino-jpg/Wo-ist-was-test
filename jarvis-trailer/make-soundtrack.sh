#!/usr/bin/env bash
set -euo pipefail
mkdir -p public
# Audible original sci-fi bed + timed HUD/impact accents. Final loudness is normalized
# for phone/social playback instead of the near-silent V1 mix.
ffmpeg -y \
  -f lavfi -i "sine=frequency=55:duration=80:sample_rate=48000" \
  -f lavfi -i "sine=frequency=110:duration=80:sample_rate=48000" \
  -f lavfi -i "anoisesrc=color=pink:duration=80:sample_rate=48000" \
  -f lavfi -i "sine=frequency=880:duration=80:sample_rate=48000" \
  -filter_complex "\
[0:a]volume=0.70,lowpass=f=180[a0];\
[1:a]volume=0.22,tremolo=f=0.16:d=0.5[a1];\
[2:a]volume=0.055,lowpass=f=1100[a2];\
[3:a]volume='if(lt(mod(t,8),0.10),0.20,0)',highpass=f=500[a3];\
[a0][a1][a2][a3]amix=inputs=4:duration=longest:normalize=0,\
afade=t=in:st=0:d=1.5,afade=t=out:st=77:d=3,\
acompressor=threshold=0.18:ratio=3:attack=20:release=250,\
loudnorm=I=-14:TP=-1.5:LRA=8" \
  -c:a pcm_s16le public/soundtrack.wav

# Verify the generated bed is not accidentally silent.
ffmpeg -hide_banner -i public/soundtrack.wav -af volumedetect -f null - 2>&1 | tail -n 8
