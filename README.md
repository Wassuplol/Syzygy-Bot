# Syzygy - The Ultimate Free, Open-Source Discord Moderation Bot

<div align="center">
  <img src="https://example.com/syzygy-logo.png" alt="Syzygy Logo" width="200" height="200">
  <br>
  <h3>The Ultimate Free, Open-Source Discord Moderation Bot</h3>
  <p><b>Rivals and exceeds all premium moderation bots (Dyno, Carl-bot, MEE6, Wick, etc.) but is 100% FREE with ZERO PAYWALLS</b></p>
  <br>
  
  [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
  [![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue)](https://discord.js.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20Mode-blue)](https://www.typescriptlang.org/)
  [![Docker](https://img.shields.io/badge/Docker-Supported-blue)](https://docker.com/)
</div>

## 🌟 Features

Syzygy is a battle-tested, enterprise-grade Discord moderation bot that offers all the features of premium bots, completely free and open-source:

### 🔧 Core Moderation
- Advanced auto-moderation with machine learning
- Context-aware profanity filtering with customizable dictionaries
- Spam detection (message flooding, mention spam, link spam, emoji spam)
- Raid protection with automatic threshold-based actions
- Invite link filtering with whitelist/blacklist management
- Media filtering (NSFW image detection, file type restrictions)
- Role/permission-based exemptions for trusted users
- Custom rule creation with AND/OR logic conditions
- Real-time monitoring dashboard with live alerts

### 🤖 Automation & Utilities
- Powerful reaction roles system (unlimited roles, dynamic menus)
- Custom command creation system (variables, conditional logic, API integrations)
- Leveling system with customizable rewards and anti-cheat protection
- Welcome/leave messages with embed customization and user variables
- Ticket system with full admin panel, categories, and automated closing
- Poll system with multiple choice, timers, and reaction-based voting
- Giveaway system with role requirements, multiple winners, and fraud detection
- Logging system with comprehensive channel logging
- Voice channel logging and auto-moderation

### 🎯 Advanced AI Vision Moderation
- **Real AI-powered image analysis** using NanoGPT API with Qwen/Qwen3-VL-235B-A22B-Instruct model
- **NSFW content detection** with high accuracy using state-of-the-art vision AI
- **Hate symbol identification** to detect and prevent harmful imagery
- **Rule violation detection** for custom server rules applied to images
- **Privacy-focused processing** - images processed in-memory only, never stored
- **Performance optimized** with caching and concurrency controls for large servers
- **Failsafe system** that falls back to rule-based filtering when AI is unavailable
- **Configurable confidence thresholds** to adjust sensitivity based on server needs

### 🛡️ Security & Anti-Abuse
- Advanced anti-nuke protection (role deletion, channel deletion, ban waves detection)
- Mass ban/kick prevention with cooldowns and approval workflows
- Verification system with captcha, phone verification, and manual approval options
- IP-based filtering and rate limiting for suspicious activities
- Bot account detection and automatic restriction
- Webhook spam protection and automatic cleanup
- Channel lockdown commands with timer-based automatic unlocking
- Emergency lockdown mode for server-wide incidents

### 📊 Advanced Features (Typically Paywall-Only)
- AI-powered chat moderation with context understanding (no false positives on quotes/memes)
- Cross-server ban synchronization (opt-in network for trusted servers)
- Advanced analytics dashboard (member growth, activity heatmaps, moderation statistics)
- Custom webhook integrations for external services
- API endpoints for external tool integration
- Mobile-responsive web dashboard for configuration
- Voice chat moderation (mute/deafen automation based on rules)
- Scheduled tasks system (automated announcements, cleanup tasks, etc.)
- Integration with external services (GitHub, Twitter, YouTube notifications)
- Custom emoji management and auto-reaction systems

## 🚀 Quick Start

### Prerequisites
- Node.js 18 or higher
- Docker and Docker Compose (recommended)
- A Discord application with bot token

### Installation

#### Option 1: Docker (Recommended)
```bash
# Clone the repository
git clone https://github.com/your-username/syzygy.git
cd syzygy

# Copy environment file
cp .env.example .env

# Edit .env with your bot token and other configurations
nano .env

# Start the bot
docker-compose up -d
```

#### Option 2: Direct Installation
```bash
# Clone the repository
git clone https://github.com/your-username/syzygy.git
cd syzygy

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your bot token and other configurations
nano .env

# Build the project
npm run build

# Start the bot
npm start
```

## ⚙️ Configuration

Create a `.env` file with the following required variables:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_bot_client_id

# Database Configuration (Choose one)
DATABASE_TYPE=sqlite           # or 'postgresql'
SQLITE_PATH=./data/syzygy.db   # Required if using SQLite
POSTGRESQL_URL=postgresql://user:password@localhost:5432/syzygy  # Required if using PostgreSQL
POSTGRESQL_POOL_SIZE=20

# Redis Configuration (Optional but recommended for large servers)
REDIS_URL=redis://localhost:6379

# Performance Configuration
MAX_MEMORY_USAGE=512           # Max memory usage in MB
CPU_THRESHOLD=70               # CPU usage threshold percentage
MAX_RESPONSE_TIME=1000         # Max response time in ms

# Privacy Configuration
DATA_RETENTION_DAYS=90         # How long to keep data before auto-purging
AUTO_PURGE_ENABLED=true        # Enable automatic data purging
COLLECT_USAGE_STATS=false      # Whether to collect usage statistics (default: false)

# Security Configuration
MAX_COMMAND_EXECUTIONS_PER_MINUTE=100
RATE_LIMIT_WINDOW_MS=60000
ANTI_NUKE_ENABLED=true
ANTI_NUKE_THRESHOLD=10

# NanoGPT AI Integration (Vision Moderation)
NANOGPT_API_KEY=your_api_key_here
AI_IMAGE_MODERATION_ENABLED=true
AI_MODEL_ID=Qwen/Qwen3-VL-235B-A22B-Instruct
AI_MAX_CONCURRENCY=5
AI_REQUEST_TIMEOUT=8000
AI_CACHE_TTL=300
AI_FAILSAFE_ENABLED=true
AI_MIN_CONFIDENCE_THRESHOLD=0.85
```

## 📚 Commands

### Moderation Commands
- `/ban <user> [reason]` - Ban a user from the server
- `/kick <user> [reason]` - Kick a user from the server
- `/mute <user> [duration] [reason]` - Mute a user
- `/warn <user> [reason]` - Warn a user
- `/purge <count>` - Delete messages in bulk

### Utility Commands
- `/ping` - Check bot latency
- `/help` - Show help information
- `/info` - Show bot information
- `/level` - Check your level and rank
- `/ticket` - Create a support ticket

### Configuration Commands
- `/config` - View and modify server configuration
- `/automod` - Configure auto-moderation settings

## 🛡️ Privacy & Data Minimization

Syzygy is built with privacy by design:

- **STRICT DATA COLLECTION POLICY**: Only store what is absolutely necessary for moderation functions
- **AUTOMATIC DATA PURGING**: All stored data has configurable TTL (time-to-live) with automatic deletion
- **NO USER TRACKING**: Never store message content unless required for active moderation cases
- **MINIMAL USER DATA**: Only store user IDs, moderation actions, and essential timestamps - NO personal information
- **GDPR/CCPA COMPLIANT**: Built-in data export and deletion commands for users
- **ENCRYPTION AT REST**: All sensitive configuration encrypted using libsodium or equivalent
- **AUDIT LOGS**: Immutable logs of all moderation actions with who did what and when
- **NO ANALYTICS**: Absolutely no telemetry, usage statistics, or data sharing with third parties

## 🏃‍♂️ Performance Optimization

Syzygy is optimized for servers with 100,000+ members:

- **SHARDING**: Automatic shard management with dynamic scaling
- **CACHING STRATEGY**: Multi-level caching (Redis + in-memory) with LRU eviction
- **RATE LIMIT HANDLING**: Sophisticated rate limit management with exponential backoff
- **BATCH PROCESSING**: Bulk operations for mass moderation actions to minimize API calls
- **LAZY LOADING**: Only load member data when absolutely necessary
- **MEMORY MANAGEMENT**: Automatic garbage collection and memory leak prevention
- **CONNECTION POOLING**: Optimized database connection pooling
- **ASYNC PROCESSING**: Non-blocking I/O operations with worker threads for CPU-intensive tasks

## 🤝 Contributing

We welcome contributions from the community! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

### Development Setup
```bash
# Clone the repository
git clone https://github.com/your-username/syzygy.git
cd syzygy

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev
```

## 📄 License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.

## 🤖 Support

For support, please open an issue in the GitHub repository or join our community Discord server (coming soon).

## 🙏 Acknowledgments

- All the open-source projects and libraries that made this possible
- The Discord.js team for their excellent library
- The TypeScript team for the powerful type system
- All contributors who help make Syzygy better

---

<div align="center">
  <sub>Built with ❤️ by the Syzygy Development Team</sub>
</div>
