# Render Keep-Awake

This repository now has a lightweight health endpoint that can be used by an uptime monitor to reduce Render cold starts.

## Endpoint

```txt
GET /api/health
HEAD /api/health
```

## Render usage

Use the deployed Render URL with the health path:

```txt
https://YOUR-RENDER-SERVICE.onrender.com/api/health
```

Ping interval recommendation: every 10-14 minutes.

Common uptime monitors:

- UptimeRobot
- Better Stack
- cron-job.org

Do not ping faster than needed. This is only intended to reduce cold starts on Render web services.
