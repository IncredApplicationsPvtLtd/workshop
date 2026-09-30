# One Commit. 100 Users. 🚀

A live DevOps workshop: one student edits a line of HTML, GitHub Actions tests and deploys it to AWS EC2, and every phone in the hall updates automatically. Then the whole hall tries to crash the server together.

- **Live:** https://workshop.incred.io
- **Mission Control:** https://workshop.incred.io/dashboard
- **Road to 1M users:** https://workshop.incred.io/scale

## Try it yourself

```bash
npm test     # the tests that guard production
npm start    # http://localhost:3000
```

## How it works

```
You edit public/index.html → git push → GitHub Actions
   ├─ 🧪 test   (node --test)
   └─ 🚚 deploy (rsync over SSH → systemctl restart → health check)
         → EC2 t2.micro (ap-south-1a) → nginx → Node.js → your phone (live over SSE)
```

| Path | What it is |
|---|---|
| `public/index.html` | The page everyone sees. Edit the **STUDENT EDIT ZONE**. |
| `app/server.js` | Zero-dependency Node server: static files, live stats, a CPU-heavy checkout |
| `test/` | Tests that block broken code from reaching production |
| `.github/workflows/deploy.yml` | CI/CD pipeline |
| `.github/workflows/launch-day.yml` | k6 load test — simulate a product launch |
| `infra/ec2-setup.sh` | One-shot server setup: Node, nginx, HTTPS, systemd |
| `docs/RUNBOOK.md` | The presenter's script |
