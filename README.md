<div align="center">

# ⏳ Chronos

**AI-Powered Historical Timeline Explorer**

Generate interactive, citation-backed timelines for any region or civilization in history. Explore events on maps, dive into narratives, and chat with an AI historian.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)

[Features](#features) • [Demo](#demo) • [Installation](#installation) • [Usage](#usage) • [Tech Stack](#tech-stack)

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

<!-- Add screenshots or GIFs here -->
*Coming soon: Live demo*

### Example Use Cases

- **"Roman Empire, 27 BCE - 476 CE"** — Explore the rise and fall of Rome
- **"Silk Road, 200 BCE - 1400 CE"** — Follow trade routes across civilizations
- **"Japanese Shogunate, 1185 - 1868"** — Dive into feudal Japan
- **"Ancient Egypt, 3100 BCE - 30 BCE"** — Discover pharaonic history

## Installation

### Prerequisites

- Node.js 18+
- A Gemini API key ([Get one free](https://aistudio.google.com/app/apikey))

### Setup

```bash
# Clone the repository
git clone https://github.com/aviju888/chronos.git
cd chronos

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Add your Gemini API key to .env.local
# GEMINI_API_KEY=your_api_key_here

# Start the development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the app.

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
| **AI** | Google Gemini API (gemini-3-flash, gemini-3-pro) |
| **Icons** | Lucide React |
| **State** | React Hooks + localStorage |

## Project Structure

```
chronos/
├── components/
│   ├── ChatPanel.tsx      # AI historian chat interface
│   ├── EventDetailModal.tsx # Event popup with citations
│   ├── EventImage.tsx     # Wikipedia image fetcher
│   ├── EventListView.tsx  # Searchable event catalog
│   ├── HistorySidebar.tsx # Saved timelines sidebar
│   ├── MapView.tsx        # Leaflet map with event markers
│   ├── NarrativeView.tsx  # AI-generated narrative display
│   ├── OnboardingOverlay.tsx # First-time user tutorial
│   ├── SetupForm.tsx      # Region/time input form
│   ├── TimelineView.tsx   # Vertical era timeline
│   └── Toast.tsx          # Notification system
├── services/
│   ├── geminiService.ts   # Gemini API integration
│   └── imageCache.ts      # Wikipedia image caching
├── App.tsx                # Main application component
├── types.ts               # TypeScript interfaces
└── index.tsx              # Entry point
```

## API Usage

Chronos uses structured JSON output from Gemini to ensure consistent, parseable responses:

- **Eras Generation** — Divides the time period into 5-10 logical historical eras
- **Events Generation** — Creates 40-80 events with categories, citations, locations, and confidence scores
- **Narrative Synthesis** — Writes a cohesive 3-5 paragraph summary
- **Follow-up Chat** — Maintains conversation context for deeper exploration

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License — see [LICENSE](LICENSE) for details.

## Acknowledgments

- Historical event images sourced from Wikipedia/Wikimedia Commons
- Map tiles from OpenStreetMap
- Built with Google's Gemini AI

---

<div align="center">

**[⬆ Back to Top](#-chronos)**

Made with ☕ by [Adriel Vijuan](https://github.com/aviju888)

</div>
