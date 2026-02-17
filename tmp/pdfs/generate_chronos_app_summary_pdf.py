from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.pdfgen import canvas

OUTPUT_PATH = "output/pdf/chronos-app-summary.pdf"

PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 36  # 0.5in
LINE_GAP = 2


def wrap_text(cnv, text, font_name, font_size, max_width):
    words = text.split()
    lines = []
    current = ""

    for word in words:
        test = word if not current else f"{current} {word}"
        if cnv.stringWidth(test, font_name, font_size) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word

    if current:
        lines.append(current)
    return lines


def draw_heading(cnv, y, text):
    cnv.setFont("Helvetica-Bold", 11)
    cnv.setFillColor(colors.HexColor("#1F2A44"))
    cnv.drawString(MARGIN, y, text)
    return y - 14


def draw_paragraph(cnv, y, text, size=9.5, left=MARGIN):
    cnv.setFont("Helvetica", size)
    cnv.setFillColor(colors.black)
    max_width = PAGE_WIDTH - MARGIN - left
    lines = wrap_text(cnv, text, "Helvetica", size, max_width)
    for line in lines:
        cnv.drawString(left, y, line)
        y -= size + LINE_GAP
    return y


def draw_bullet(cnv, y, text, size=9.5):
    bullet_x = MARGIN + 4
    text_x = MARGIN + 14
    cnv.setFont("Helvetica", size)
    cnv.setFillColor(colors.black)
    cnv.drawString(bullet_x, y, "-")
    max_width = PAGE_WIDTH - MARGIN - text_x
    lines = wrap_text(cnv, text, "Helvetica", size, max_width)
    first = True
    for line in lines:
        cnv.drawString(text_x, y, line)
        y -= size + LINE_GAP
        if first:
            first = False
    return y


def main():
    cnv = canvas.Canvas(OUTPUT_PATH, pagesize=letter)

    y = PAGE_HEIGHT - MARGIN

    cnv.setFont("Helvetica-Bold", 15)
    cnv.setFillColor(colors.HexColor("#102A43"))
    cnv.drawString(MARGIN, y, "Chronos App Summary")
    y -= 18

    cnv.setFont("Helvetica", 8)
    cnv.setFillColor(colors.HexColor("#4A5568"))
    cnv.drawString(MARGIN, y, "Repository-backed summary (1 page)")
    y -= 16

    y = draw_heading(cnv, y, "What it is")
    y = draw_paragraph(
        cnv,
        y,
        "Chronos is an AI-powered historical timeline explorer. It generates citation-backed timelines, narratives, map events, and follow-up historical Q&A for a selected region and time range.",
    )
    y -= 6

    y = draw_heading(cnv, y, "Who it is for")
    y = draw_paragraph(
        cnv,
        y,
        "Primary persona: history-curious learners and researchers exploring a region or topic across time. Explicit persona definition in product docs: Not found in repo.",
    )
    y -= 6

    y = draw_heading(cnv, y, "What it does")
    feature_bullets = [
        "Generates timelines in Quick and Deep modes.",
        "Shows geolocated events on a map with timeline playback controls.",
        "Provides map, timeline, event list, and narrative views for the same dataset.",
        "Offers search suggestions and map-click region discovery.",
        "Supports follow-up chat with a historian assistant per timeline.",
        "Persists local archives and supports share/export actions.",
    ]
    for bullet in feature_bullets:
        y = draw_bullet(cnv, y, bullet)
    y -= 4

    y = draw_heading(cnv, y, "How it works (repo evidence)")
    architecture_bullets = [
        "React + Vite frontend in App.tsx orchestrates views, state, and interaction flow.",
        "Frontend sends action-based POST requests to /api/generate via services/apiService.ts.",
        "api/generate.ts validates input, applies per-action and global rate limits, and dispatches actions: suggestions, regions, timeRange, timeline, followUp.",
        "Timeline generation merges Groq LLM output with Wikipedia lookups and Wikidata enrichment (api/generate.ts, lib/wikidata.ts).",
        "Timeline and chat history are persisted in browser localStorage (services/storageService.ts, components/ChatPanel.tsx).",
    ]
    for bullet in architecture_bullets:
        y = draw_bullet(cnv, y, bullet)
    y -= 4

    y = draw_heading(cnv, y, "How to run (minimal)")
    run_steps = [
        "npm install",
        "Copy .env.example to .env.local and set GROQ_API_KEY.",
        "Run frontend: npm run dev (Vite dev server on port 3000).",
        "Backend local run command needed for proxy target http://localhost:3001: Not found in repo.",
    ]

    step_num = 1
    for step in run_steps:
        y = draw_bullet(cnv, y, f"{step_num}. {step}")
        step_num += 1

    if y < MARGIN:
        raise RuntimeError("Content overflowed one page. Reduce content or font size.")

    cnv.showPage()
    cnv.save()


if __name__ == "__main__":
    main()
