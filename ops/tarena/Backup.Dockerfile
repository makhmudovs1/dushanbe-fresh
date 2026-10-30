FROM restic/restic:0.19.1@sha256:136600b6ff6843d61d355f7f71f460a166429f35de6fd11b568fece3c9a4d510 AS restic
FROM postgres:16-bookworm@sha256:e8a07d2c7579b038938cdba6c539e580e5001caf9ea203d397b5cc83e76bd938
RUN apt-get update && apt-get install -y --no-install-recommends python3 openssh-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
USER 1000:1000
ENTRYPOINT ["python3", "/ops/production-backup.py"]
