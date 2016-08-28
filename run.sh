#!/usr/bin/env bash
docker build -t webrtc .
docker run -ti --rm -p 8080:8080 --name webrtc -v $(pwd)/public:/application/public webrtc
