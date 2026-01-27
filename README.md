<div align="center">

# ⏳ Chronos

**AI-Powered Historical Timeline Explorer**

Generate interactive, citation-backed timelines for any region or civilization in history. Explore events on maps, dive into narratives, and chat with an AI historian.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Site-success?style=for-the-badge)](https://chronos-explorer.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Groq](https://img.shields.io/badge/Groq-F55036?style=for-the-badge&logo=groq&logoColor=white)](https://groq.com/)

[Features](#features) • [Live Demo](#demo) • [Installation](#installation) • [Usage](#usage) • [Tech Stack](#tech-stack)

</div>

---

## Features

🗺️ **Interactive Map View** — Explore historical events pinned to their geographic locations with Leaflet maps

📅 **Timeline Visualization** — See events organized by era with a beautiful vertical timeline

📋 **Event Catalog** — Browse, filter, and search through all generated events with citations

📖 **AI Narrative** — Read a cohesive historical narrative synthesized from all events

💬 **Chat with a Historian** — Ask follow-up questions about any event or time period

🔍 **Smart Search** — Type a region name and get intelligent suggestions for historically significant areas

📍 **Click-to-Explore** — Click anywhere on the map to discover what civilizations existed there

⚡ **Quick & Deep Modes** — Choose between fast generation (40 events) or comprehensive research (80+ events)

🏛️ **Citation-Backed** — Every event includes academic citations and confidence scores

⚠️ **Disputed Events** — Automatically flags historically contested events with multiple perspectives

💾 **Local Archives** — Save and revisit your generated timelines

🔗 **Deep Linking** — Share direct links to specific timelines, views, or events

## Demo

🌐 **[Try the Live Demo →](https://chronos-explorer.vercel.app)**

<!-- Screenshots will be added here -->

### Example Use Cases

- **"Roman Empire, 27 BCE - 476 CE"** — Explore the rise and fall of Rome
- **"Silk Road, 200 BCE - 1400 CE"** — Follow trade routes across civilizations
- **"Japanese Shogunate, 1185 - 1868"** — Dive into feudal Japan
- **"Ancient Egypt, 3100 BCE - 30 BCE"** — Discover pharaonic history

## Installation

### Prerequisites

- Node.js 18+
- A Groq API key ([Get one free](https://console.groq.com/keys) — no credit card required!)

### Local Development

```bash
# Clone the repository
git clone https://github.com/aviju888/chronos.git
cd chronos

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Add your Groq API key to .env.local
# GROQ_API_KEY=your_api_key_here

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Deploy Your Own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Faviju888%2Fchronos&env=GROQ_API_KEY&envDescription=Get%20your%20free%20Groq%20API%20key%20at%20console.groq.com&project-name=chronos&repository-name=chronos)

1. Click the button above
2. Add your `GROQ_API_KEY` environment variable
3. Deploy!

## Usage

1. **Enter a Region** — Type any historical region, empire, or civilization
2. **Set Time Range** — Define start and end years (or let AI suggest based on the region)
3. **Choose Mode** — Quick (faster, ~40 events) or Deep (thorough, ~80 events)
4. **Explore** — Switch between Map, Timeline, Events, and Narrative views
5. **Chat** — Click the chat icon to ask follow-up questions
6. **Save** — Your timelines are automatically saved to local storage

## Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | React 19, TypeScript, Vite |
| **Styling** | Tailwind CSS |
| **Maps** | Leaflet, React-Leaflet |
| **AI** | Groq API (Llama 3.3 70B, Llama 3.1 8B) |
| **Deployment** | Vercel (Frontend + Serverless Functions) |
| **Icons** | Lucide React |
| **State** | React Hooks + localStorage |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Vercel                               │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │   Static Frontend   │    │   Serverless API (/api)     │ │
│  │   (React + Vite)    │───▶│   - Timeline generation     │ │
│  │                     │    │   - Chat follow-ups         │ │
│  └─────────────────────┘    │   - Search suggestions      │ │
│                             └──────────────┬──────────────┘ │
└────────────────────────────────────────────┼────────────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │    Groq API     │
                                    │  (Llama 3.3)    │
                                    └─────────────────┘
```

## Project Structure

```
chronos/
├── api/
│   └── generate.ts       # Vercel serverless function (Groq integration)
├── components/
│   ├── ChatPanel.tsx     # AI historian chat interface
│   ├── EventDetailModal.tsx # Event popup with citations
│   ├── EventImage.tsx    # Wikipedia image fetcher
│   ├── EventListView.tsx # Searchable event catalog
│   ├── HistorySidebar.tsx # Saved timelines sidebar
│   ├── MapView.tsx       # Leaflet map with event markers
│   ├── NarrativeView.tsx # AI-generated narrative display
│   ├── OnboardingOverlay.tsx # First-time user tutorial
│   ├── SetupForm.tsx     # Region/time input form
│   ├── TimelineView.tsx  # Vertical era timeline
│   └── Toast.tsx         # Notification system
├── services/
│   ├── apiService.ts     # Frontend API client
│   └── imageCache.ts     # Wikipedia image caching
├── App.tsx               # Main application component
├── types.ts              # TypeScript interfaces
└── index.tsx             # Entry point
```

## API Usage

Chronos uses Groq's ultra-fast LLM inference to generate structured historical data:

- **Eras Generation** — Divides the time period into 5-10 logical historical eras
- **Events Generation** — Creates 40-80 events with categories, citations, locations, and confidence scores
- **Narrative Synthesis** — Writes a cohesive 3-5 paragraph summary
- **Follow-up Chat** — Maintains conversation context for deeper exploration

### Why Groq?

- 🚀 **Speed**: 300+ tokens/second inference
- 💸 **Free**: 14,400 requests/day, no credit card required
- 🧠 **Quality**: Llama 3.3 70B for deep analysis, 8B for fast queries

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License — see [LICENSE](LICENSE) for details.

## Acknowledgments

- LLM inference powered by [Groq](https://groq.com/)
- Historical event images sourced from Wikipedia/Wikimedia Commons
- Map tiles from OpenStreetMap
- Originally prototyped with Google's Gemini AI

---

<div align="center">

**[⬆ Back to Top](#-chronos)**

Made with ☕ by [Adriel Vijuan](https://github.com/aviju888)

</div>
