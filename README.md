# 🌀 Recall Queue — Discord Queue System Bot

**Recall Queue** is a custom-built Discord bot written in **JavaScript (Node.js)**, designed for **competitive gaming communities**.  
It manages ranked queues, player stats, and match histories — keeping every game fair, organized, and tracked automatically.

---

## ✨ Features

### 🧩 Queue System
- Join ranked queues directly through voice channels.
- Automatically moves full queues (5/5) into ranked voice channels.
- Handles trio fallback (3/5 after timer).
- Prevents manual joining of ranked VCs for fair queue control.

### 📊 Player Stats
- `/stats` — view your own stats or check another player’s.
- Displays total games, winrate, and match-type breakdowns.

### 🕹️ Match History
- `/history` — see recent matches for yourself or others.
- Every finished match is logged with player names, type, and result.

### 🪪 MLBB Player ID Linking
- `/registermlbb` — link your Mobile Legends player ID.
- `/profile` — view your registered ID or another player’s.

### 🎓 Leaderboards
- Dedicated leaderboard for top-performing players.
- Automatically updates when matches finish.

### 📨 Queue Notifications
- Get notified via DM when your queue is about to start.

## ⚙️ Installation

### 1️⃣ Clone the Repository
```
git clone https://github.com/YOUR_USERNAME/Recall Queue.git
cd ROGUEq
```

2️⃣ Install Dependencies
```
npm install
```

3️⃣ Configure Environment
Create a .env file in the root directory:
```
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id
GUILD_ID=your_test_guild_id
MONGODB_URI=your_mongodb_connection_string   # if using MongoDB
```

4️⃣ Run the Bot
```node index.js```

or if you use PM2 for 24/7 hosting:

```
pm2 start index.js --name "ROGUEq"
pm2 save
```

🔧 Commands Overview
```
Command	Description
/join	Join the ranked queue
/stats [user]	View player statistics
/history [user]	Check recent matches
/registermlbb <id>	Register your MLBB player ID
/profile [user]	View linked MLBB profile
/leaderboard	View top squad players
/finishmatch	Log a match result
```

🧠 Future Development
- 🛠️ Admin Config Panel for queue & match settings
- 📅 Scheduled Leaderboard Resets
- 🧾 Enhanced Match Analytics
- 🌐 Web Dashboard Integration


🤝 Contributing
Contributions, bug reports, and feature requests are always welcome!
Feel free to open an issue or submit a pull request.

🧑‍💻 Author
Raphael (Mcknbrd)
Custom Discord Bot Developer
