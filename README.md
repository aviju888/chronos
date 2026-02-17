<div align="center">

# Chronos

**AI-Powered Historical Timeline Explorer**

Generate interactive, citation-backed timelines for any region or civilization in history. Explore events on maps, dive into narratives, and chat with an AI historian.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Site-success?style=for-the-badge)](https://chronos-history.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Groq](https://img.shields.io/badge/Groq-F55036?style=for-the-badge&logo=groq&logoColor=white)](https://groq.com/)

[Features](#features) • [Live Demo](#demo) • [Tech Stack](#tech-stack) • [Architecture](#architecture)

</div>

---

## About

Chronos is a passion project born from my love of history and curiosity about different eras and civilizations. Built by [Adriel Vijuan](https://github.com/aviju888), leveraging AI coding tools to rapidly prototype and iterate on a full-stack application that makes historical exploration interactive and accessible.

The app synthesizes data from multiple sources—Groq-powered LLM generation, Wikidata SPARQL queries, and Wikipedia APIs—to create comprehensive, citation-backed timelines with map visualizations, event catalogs, and AI-powered follow-up conversations.

---

## Features

**Interactive Map View** — Explore historical events pinned to their geographic locations with Leaflet maps

**Timeline Visualization** — See events organized by era with a vertical timeline and animated playback

**Event Catalog** — Browse, filter, and search through all generated events with citations

**AI Narrative** — Read a cohesive historical narrative synthesized from all events

**Chat with a Historian** — Ask follow-up questions about any event or time period

**Smart Search** — Type a region name and get intelligent suggestions for historically significant areas

**Click-to-Explore** — Click anywhere on the map to discover what civilizations existed there

**Quick & Deep Modes** — Choose between fast generation (~40 events) or comprehensive research (~80 events)

**Citation-Backed** — Every event includes academic citations and confidence scores

**Disputed Events** — Automatically flags historically contested events with multiple perspectives

**Multi-Source Enrichment** — Combines LLM generation with Wikidata SPARQL and Wikipedia for accuracy

**Local Archives** — Save and revisit your generated timelines

**Deep Linking** — Share direct links to specific timelines, views, or events

## Demo

**[Try the Live Demo →](https://chronos-history.vercel.app)**

### Example Queries

- **"Roman Empire, 27 BCE - 476 CE"** — Explore the rise and fall of Rome
- **"Silk Road, 200 BCE - 1400 CE"** — Follow trade routes across civilizations
- **"Japanese Shogunate, 1185 - 1868"** — Dive into feudal Japan
- **"Ancient Egypt, 3100 BCE - 30 BCE"** — Discover pharaonic history

## Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | React 19, TypeScript, Vite |
| **Styling** | Tailwind CSS |
| **Maps** | Leaflet, React-Leaflet |
| **Data Sources** | Wikidata SPARQL, Wikipedia API |
| **AI** | Groq API (Llama 3.3 70B) |
| **Deployment** | Vercel (Frontend + Serverless Functions) |
| **Icons** | Lucide React |
| **State** | React Hooks + localStorage |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Vercel                              │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │   Static Frontend   │    │   Serverless API (/api)     │ │
│  │   (React + Vite)    │───▶│   - Timeline generation     │ │
│  │                     │    │   - Chat follow-ups         │ │
│  └─────────────────────┘    │   - Search suggestions      │ │
│                             └──────────────┬──────────────┘ │
└────────────────────────────────────────────┼────────────────┘
                                             │
                         ┌───────────────────┼───────────────────┐
                         │                   │                   │
                         ▼                   ▼                   ▼
                ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
                │    Groq API     │ │ Wikidata SPARQL │ │  Wikipedia API  │
                │  (Llama 3.3)    │ │  (Enrichment)   │ │   (Details)     │
                └─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Project Structure

```
chronos/
├── api/
│   ├── generate.ts       # Timeline generation (LLM + data enrichment)
│   ├── chat.ts           # AI historian follow-up chat
│   └── suggest.ts        # Search autocomplete
├── lib/
│   ├── wikidata.ts       # Wikidata SPARQL integration
│   ├── validation.ts     # Input validation
│   └── parsing.ts        # Response parsing utilities
├── components/
│   ├── ChatPanel.tsx     # AI historian chat interface
│   ├── EventDetailModal.tsx # Event popup with citations
│   ├── EventImage.tsx    # Wikipedia image fetcher
│   ├── EventListView.tsx # Searchable event catalog
│   ├── HistorySidebar.tsx # Saved timelines sidebar
│   ├── MapView.tsx       # Leaflet map with event markers
│   ├── NarrativeView.tsx # AI-generated narrative display
│   ├── SetupForm.tsx     # Region/time input form
│   └── TimelineView.tsx  # Vertical era timeline
├── App.tsx               # Main application component
├── types.ts              # TypeScript interfaces
└── index.tsx             # Entry point
```

## Data Pipeline

1. **Era Generation** — Groq (Llama 3.3) divides the time period into 5-10 logical historical eras
2. **Seed Events** — Groq generates anchor events with Wikipedia article titles
3. **Wikidata Enrichment** — SPARQL queries discover additional events with exact dates and coordinates
4. **Wikipedia Details** — Fetches descriptions, sub-events, and images
5. **Deduplication & Ranking** — Merges sources, removes duplicates, categorizes events
6. **Narrative Synthesis** — Generates cohesive 3-5 paragraph summary

## Acknowledgments

- LLM inference powered by [Groq](https://groq.com/)
- Historical event images sourced from Wikipedia/Wikimedia Commons
- Structured data from Wikidata
- Map tiles from OpenStreetMap

---

<div align="center">

**[Back to Top](#chronos)**

Built by [Adriel Vijuan](https://github.com/aviju888)

</div>
