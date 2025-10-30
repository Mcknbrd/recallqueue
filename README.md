🧠 Recall Queue — Project Definition
🏷️ Project Name

Recall Queue

🧩 Description

Recall Queue is a Discord bot built for Mobile Legends: Bang Bang communities.
It helps members find teammates, form ranked squads, and track performance, turning an ordinary Discord server into a fully automated competitive hub.

All development is tracked via GitHub version control, with every feature, bug fix, and enhancement managed through branches, commits, and pull requests.

🎯 Core Purpose

Recall Queue isn’t a random matchmaking tool — it’s a team coordination system designed to help existing community members form 3Q and 5Q ranked teams efficiently.

It centralizes:

Queue management

Voice channel control

Match tracking

MMR and stat progression

Resulting in a seamless and structured ranked environment for your Discord community.

⚙️ Key Features
🧩 Queue System

Duo (2Q), Trio (3Q), and Full-Stack (5Q) modes

Unified embed with Join/Leave buttons

Auto-refresh countdown cycle

Dynamic embed updates:

Players waiting

Countdown timer

Queue type

Active teams formed

🔒 Voice Channel Control

Only queued users can join the Ranked Queue Lobby

When queue fills, bot auto-moves players to a free ranked VC

Leaving the queue removes VC access and disconnects the player

🏆 Match Management & Verification

Match records created when teams form

Players submit results via:

/match result:<win/loss> screenshot:<proof>


Staff verify results with buttons (Approve Win / Approve Loss)

Verified matches update player MMR and stats

Auto-post summary embed in #match-history

👤 Player Profiles & Stats

Persistent player data includes:

Discord ID & Username

MLBB ID / IGN

Rank (Mythic, Legend, etc.)

Preferred Roles

Matches Played, Wins, Losses, MMR, Winrate

Cooldown/AFK state

Commands:

/profile — View stats

/registermlbb — Link MLBB account

/queueinfo — Show queue status

🕓 Anti-AFK & Cooldowns

Leaving mid-queue or dodging applies cooldowns

Cooldown displayed when trying to requeue

🧠 Rank-Based Grouping (Planned)

Future teammate recommendations by MMR and rank tier

📊 Match History

Auto-post verified match summaries showing:

Queue type (3Q/5Q)

Player MMR changes

VC used

Date & time

🧰 Tech Stack
Area	Technology
Runtime	Node.js (ESM modules)
Discord API	Discord.js v14
Database	MongoDB + Mongoose
Scheduler	Native setInterval
Language	JavaScript (ESM)
Hosting	VPS / Linux
Version Control	GitHub
Auth	Discord Bot Token + Guild Config
🗂️ Project Structure
RecallQ/
├── commands/
│   ├── joinqueue.js
│   ├── leavequeue.js
│   ├── matchResult.js
│   ├── matchVerify.js
│   ├── profile.js
│   ├── queueinfo.js
│   ├── registermlbb.js
│   └── ping.js
├── config/
│   └── config.js
├── events/
│   ├── ready.js
│   └── interactionCreate.js
├── models/
│   ├── player.model.js
│   ├── queue.model.js
│   └── match.model.js
├── utils/
│   ├── logger.js
│   ├── queueManager.js
│   ├── queueAccess.js
│   ├── queueUI.js
│   ├── playerManager.js
│   ├── database.js
│   └── registerCommands.js
└── index.js

🚀 Long-Term Goals

Rank-based teammate recommendations

Automatic verification via MLBB API / OCR

Seasonal leaderboards

Tournament mode

Web dashboard (queue management, player insights)

Full CI/CD GitHub pipeline

🧩 GitHub Workflow & Version Control
🔀 Branching Strategy

The project follows a simple but scalable Git Flow:

main → production-ready releases  
dev → main integration branch for testing  
feature/* → individual feature branches  
fix/* → bugfix branches  
hotfix/* → urgent production fixes


Example Workflow

# Clone project
git clone https://github.com/<username>/RecallQ.git
cd RecallQ

# Create and switch to dev
git checkout -b dev

# Start a new feature
git checkout -b feature/queue-ui

# Make changes, then commit
git add .
git commit -m "feat(queue-ui): added unified queue embed and join/leave logic"

# Push feature branch
git push -u origin feature/queue-ui

# Open PR → dev → main


Merging Flow:

Work happens in feature/* or fix/* branches.

Pull Requests merge into dev.

Once stable, dev merges into main.

Tagged releases (e.g. v1.0.0) are deployed.

✍️ Commit Message Convention

Follow Conventional Commits for clear history and changelogs:

Type	Purpose
feat:	A new feature
fix:	A bug fix
docs:	Documentation updates
style:	Formatting, linting
refactor:	Code restructure without feature change
test:	Adding or updating tests
chore:	Maintenance or tooling changes

Examples:

feat(queue-system): add queue auto-refresh with countdown
fix(voice-control): prevent unauthorized users from joining VC
docs(readme): add setup instructions

🧱 Recommended Branch Naming
Branch Type	Format	Example
Feature	feature/<feature-name>	feature/match-verification
Fix	fix/<issue>	fix/queue-countdown
Hotfix	hotfix/<issue>	hotfix/mmr-calculation
Docs	docs/<topic>	docs/readme-update
🪄 Release Tags

When merging stable builds into main, tag versions using semantic versioning:

v1.0.0 — Initial release  
v1.1.0 — Minor feature additions  
v1.1.1 — Small bug fixes  


Example:

git tag -a v1.0.0 -m "Initial stable release"
git push origin v1.0.0

📄 Project Summary (Short Version for GitHub Description)

Recall Queue is a Discord bot for a Mobile Legends community that helps members find teammates, manage ranked queues, and track performance.
It supports Duo, Trio, and Full-Stack queueing, voice channel control, match verification, and MMR tracking — fully version-controlled via GitHub.
