# Workshop Runbook — "One Commit. 100 Users."

**Live site:** https://workshop.incred.io  ·  **Projector:** https://workshop.incred.io/dashboard?key=EVENT_TOKEN  ·  **Scale story:** https://workshop.incred.io/scale

## Screens to have open (in this order, as browser tabs)

1. `/dashboard?key=…` — Mission Control (QR code, live charts, Flash Sale button)
2. GitHub repo → `public/index.html` → ✏️ edit (web editor, logged in as you)
3. GitHub → Actions tab
4. GitHub → Actions → **🔥 Launch Day** → "Run workflow" dialog
5. `/scale` on the projector
6. Backup: screen recording of the whole flow

## 30 minutes before

- [ ] Open the site on your phone and on the projector — green dot = connected
- [ ] Run **Actions → 🚀 Test & Deploy → Run workflow** once (warms up, confirms SSH works)
- [ ] Check the hall WiFi / keep a mobile hotspot ready
- [ ] Reset the headline to "Hello from the future engineers of India!" if you rehearsed

## The show (~45 min)

### Act 1 — "You are the users" (5 min)
Show the dashboard. "Scan this." Watch **👥 people online** climb from 1 → 80.
> "Right now, every one of you is connected to ONE computer in Mumbai. 1 CPU. 1 GB RAM. Cheaper than your Netflix subscription."

### Act 2 — One developer ships (10 min)
Invite a student on stage. In the GitHub web editor, they change the text between the `STUDENT EDIT ZONE` comments:
- `Your Name Here` → their name
- the `<h1>` headline → anything they like
- (bonus) `--accent: #7c5cff;` → `#ef4444` or `#22c55e` — the whole hall's screens change colour

They write a commit message and click **Commit changes**. Switch to the Actions tab.
Phones get toasts live: 📦 commit pushed → 🧪 testing → ✅ passed → 🚚 deploying → 🚀 **every phone flips automatically** with a full-screen "New version is LIVE".
> "Nobody refreshed. Nobody FTP'd anything. 40 seconds from a keyboard on stage to 80 phones."

### Act 3 — The pipeline protects you (5 min)
Second student: delete the Buy button line (`<button id="buy-btn" …>`) or empty the `<h1>`. Commit.
Tests go ❌ red. Every phone gets "❌ Tests FAILED — production is protected". **The live site never changed.**
> "The Buy button is the business. A test just saved crores. That's why companies care about CI."

Then fix it (or click *Revert* in GitHub) to show recovery.

### Act 4 — Launch day 🔥 (10 min)
1. Everyone taps **Buy now** once. Checkout: ~50–100ms. "Fast, right?"
2. Click **🔥 Start Flash Sale** on the dashboard. Every phone shows a red TAP TO BUY button.
   "The whole hall vs. one server. Tap as fast as you can!"
3. Watch: CPU → 100%, queue fills, p95 latency line crosses **"users start leaving"**, ❌ errors appear.
   Phones show "🔥 Server under heavy load" and "❌ this customer just left for a competitor."
4. **🛑 Stop**. Latency falls back. "That was 100 of you. Flipkart's Big Billion Day is crores."
5. Optional: Actions → **🔥 Launch Day** → Run with 300–500 users. Machines from GitHub's data centres now join the attack; the students' own Buy clicks become painfully slow.

### Act 5 — How engineers think about scale (10 min)
Open `/scale`, drag the slider 100 → 100M. For each stage: what broke, how it's fixed, which skill it needs.
Close with:
> "The student who changed one line today touched HTML, Git, CI, testing, Linux, SSH, DNS, AWS, networking and performance. Nobody asked them 'frontend or backend?'. The industry needs people who understand the whole journey from keyboard to user."

## If something goes wrong

| Symptom | Fix |
|---|---|
| Site down | `ssh` in → `sudo systemctl restart workshop nginx` |
| Deploy job fails at SSH | Security group must allow port 22 from `0.0.0.0/0` (GitHub runners have changing IPs) |
| Phones don't auto-reload | They still see the change on refresh — carry on |
| Server stays slow after the load test | t2.micro CPU credits ran out. Stop/start with t3.small (the Elastic IP stays the same) |
| WiFi dies | Hotspot + projector-only demo; play the backup recording |

## Tunables (in `/etc/workshop.env` on the server, then `sudo systemctl restart workshop`)

- `CHECKOUT_ITERATIONS=60000` — cost of one checkout. Higher = server breaks sooner.
- `MAX_IN_FLIGHT=150` — queue size before returning 503 "Server overloaded".
