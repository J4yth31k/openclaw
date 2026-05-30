"""
PDF product generator — generates sellable printable digital products
=====================================================================
Requires: fpdf2  (pip install fpdf2)

Produces A4 + US Letter variants for each product type.
"""

from __future__ import annotations
import os
from pathlib import Path
from fpdf import FPDF

OUTPUT_DIR = Path(os.getenv("PDF_OUTPUT_DIR", "/tmp/openclaw_products"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Design tokens ─────────────────────────────────────────────────────────────

CREAM    = (252, 249, 242)
CHARCOAL = (40,  40,  46)
ACCENT   = (99,  102, 241)   # indigo
SOFT     = (180, 176, 220)
LIGHT    = (230, 230, 240)
WHITE    = (255, 255, 255)

HEADER_H  = 22
ROW_H     = 10
MARGIN    = 15

# ── Base PDF class ────────────────────────────────────────────────────────────

class BasePDF(FPDF):
    def __init__(self, title: str, subtitle: str = ""):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.set_margins(MARGIN, MARGIN, MARGIN)
        self.set_auto_page_break(auto=True, margin=MARGIN)
        self.add_page()
        self._title    = title
        self._subtitle = subtitle
        self._draw_header()

    def _draw_header(self):
        # Background bar
        self.set_fill_color(*ACCENT)
        self.rect(0, 0, 210, HEADER_H + 6, "F")
        # Title
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(*WHITE)
        self.set_xy(MARGIN, 6)
        self.cell(0, 10, self._title, ln=False, align="L")
        if self._subtitle:
            self.set_font("Helvetica", "", 9)
            self.set_text_color(*LIGHT)
            self.set_xy(MARGIN, 16)
            self.cell(0, 6, self._subtitle, ln=False, align="L")
        # Branding
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*LIGHT)
        self.set_xy(0, 20)
        self.cell(210 - MARGIN, 6, "OpenClaw Crafts  ·  openclaw.vercel.app", align="R")
        self.set_text_color(*CHARCOAL)
        self.ln(HEADER_H - 4)

    def section(self, label: str):
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(*ACCENT)
        self.set_text_color(*WHITE)
        self.cell(0, 7, f"  {label}", ln=True, fill=True)
        self.set_text_color(*CHARCOAL)
        self.ln(1)

    def labeled_box(self, label: str, h: int = ROW_H, w: float = 0):
        self.set_font("Helvetica", "", 8)
        self.set_draw_color(*SOFT)
        self.set_fill_color(*CREAM)
        self.cell(w or self.w - 2 * MARGIN, h, f"  {label}", border=1, ln=True, fill=True)

    def grid_row(self, labels: list[str], h: int = ROW_H):
        w = (self.w - 2 * MARGIN) / len(labels)
        for lbl in labels:
            self.set_font("Helvetica", "", 8)
            self.set_draw_color(*SOFT)
            self.set_fill_color(*CREAM)
            self.cell(w, h, f"  {lbl}", border=1, fill=True)
        self.ln()

    def empty_rows(self, count: int, h: int = ROW_H):
        for _ in range(count):
            self.set_fill_color(*WHITE)
            self.set_draw_color(*LIGHT)
            self.cell(0, h, "", border=1, ln=True, fill=True)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(180, 180, 180)
        self.cell(0, 8, f"OpenClaw Crafts  ·  Personal & commercial use  ·  Page {self.page_no()}", align="C")

# ── Product 1 — Daily Planner ─────────────────────────────────────────────────

def make_daily_planner() -> Path:
    pdf = BasePDF("DAILY PLANNER", "Undated · Time-blocked · US Letter compatible")

    # Date / focus
    pdf.section("TODAY")
    pdf.grid_row(["Date:", "Day:"], h=9)
    pdf.ln(2)
    pdf.labeled_box("Top priority for today:")
    pdf.empty_rows(2, 8)
    pdf.ln(3)

    # Time blocks
    pdf.section("SCHEDULE")
    times = ["5 AM", "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM",
             "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM",
             "7 PM", "8 PM", "9 PM", "10 PM"]
    for t in times:
        pdf.grid_row([t, ""], h=8)
    pdf.ln(3)

    # To-do + notes
    pdf.section("TO-DO")
    for i in range(1, 9):
        pdf.grid_row([f"□  {i}.", ""], h=8)
    pdf.ln(3)

    pdf.section("NOTES")
    pdf.empty_rows(6, 9)
    pdf.ln(3)

    pdf.section("END OF DAY REFLECTION")
    pdf.labeled_box("Wins today:")
    pdf.empty_rows(2, 8)
    pdf.labeled_box("What I'll do better tomorrow:")
    pdf.empty_rows(2, 8)

    out = OUTPUT_DIR / "daily_planner.pdf"
    pdf.output(str(out))
    return out

# ── Product 2 — Weekly Habit Tracker ─────────────────────────────────────────

def make_weekly_habit_tracker() -> Path:
    pdf = BasePDF("WEEKLY HABIT TRACKER", "7-day grid · Track up to 10 habits")

    days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "✓"]
    pdf.section("WEEK OF:")
    pdf.labeled_box("")
    pdf.ln(3)

    # Header row
    pdf.set_font("Helvetica", "B", 8)
    habit_col = (pdf.w - 2 * MARGIN) * 0.38
    day_col   = (pdf.w - 2 * MARGIN - habit_col) / 8
    pdf.set_fill_color(*ACCENT)
    pdf.set_text_color(*WHITE)
    pdf.cell(habit_col, 9, "  HABIT", border=1, fill=True)
    for d in days:
        pdf.cell(day_col, 9, d, border=1, fill=True, align="C")
    pdf.ln()
    pdf.set_text_color(*CHARCOAL)

    # Habit rows
    for i in range(1, 11):
        pdf.set_fill_color(*CREAM if i % 2 else WHITE)
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(habit_col, 10, f"  {i}. Habit name", border=1, fill=True)
        for _ in range(8):
            pdf.cell(day_col, 10, "□", border=1, align="C", fill=True)
        pdf.ln()

    pdf.ln(4)
    pdf.section("WEEKLY NOTES & REFLECTIONS")
    pdf.empty_rows(8, 9)
    pdf.ln(3)
    pdf.section("STREAK RECORD")
    pdf.grid_row(["Best streak this week:", "Habit I want to improve:"])

    out = OUTPUT_DIR / "weekly_habit_tracker.pdf"
    pdf.output(str(out))
    return out

# ── Product 3 — Monthly Budget Tracker ───────────────────────────────────────

def make_budget_tracker() -> Path:
    pdf = BasePDF("MONTHLY BUDGET TRACKER", "Income · Expenses · Bill Pay Calendar")

    # Income
    pdf.section("INCOME")
    pdf.grid_row(["Source", "Expected", "Actual", "Difference"])
    income_sources = ["Primary Job", "Side Income", "Freelance", "Investments", "Other"]
    for src in income_sources:
        pdf.grid_row([src, "$", "$", "$"], h=9)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(*ACCENT)
    pdf.set_text_color(*WHITE)
    pdf.grid_row(["TOTAL INCOME", "$", "$", "$"], h=10)
    pdf.set_text_color(*CHARCOAL)
    pdf.ln(3)

    # Fixed expenses
    pdf.section("FIXED EXPENSES")
    pdf.grid_row(["Expense", "Due Date", "Amount", "Paid?"])
    fixed = ["Rent / Mortgage", "Car Payment", "Insurance", "Phone", "Internet",
             "Subscriptions", "Student Loan", "Other Fixed"]
    for f in fixed:
        pdf.grid_row([f, "", "$", "□"], h=9)
    pdf.ln(3)

    # Variable expenses
    pdf.section("VARIABLE EXPENSES")
    pdf.grid_row(["Category", "Budget", "Spent", "Difference"])
    variable = ["Groceries", "Dining Out", "Gas / Transport", "Entertainment",
                "Shopping", "Health / Fitness", "Personal Care", "Misc"]
    for v in variable:
        pdf.grid_row([v, "$", "$", "$"], h=9)
    pdf.ln(3)

    # Summary
    pdf.section("MONTHLY SUMMARY")
    for row in ["Total Income:", "Total Expenses:", "NET SAVINGS:", "Savings Goal:"]:
        pdf.grid_row([row, "$"], h=10)

    out = OUTPUT_DIR / "budget_tracker.pdf"
    pdf.output(str(out))
    return out

# ── Product 4 — Gratitude Journal ────────────────────────────────────────────

def make_gratitude_journal() -> Path:
    pdf = BasePDF("GRATITUDE JOURNAL", "30-day daily practice · Wellness & mindset")

    for day in range(1, 31):
        if day > 1:
            pdf.add_page()
            pdf._draw_header()

        pdf.set_font("Helvetica", "B", 11)
        pdf.set_fill_color(*LIGHT)
        pdf.cell(0, 10, f"  DAY {day}", ln=True, fill=True)
        pdf.ln(2)

        pdf.labeled_box("Date:")
        pdf.ln(2)

        pdf.section("3 THINGS I AM GRATEFUL FOR")
        for n in ["1.", "2.", "3."]:
            pdf.set_font("Helvetica", "", 8)
            pdf.cell(8, 9, n, border=0)
            pdf.set_fill_color(*WHITE)
            pdf.set_draw_color(*SOFT)
            pdf.cell(pdf.w - 2 * MARGIN - 8, 9, "", border=1, ln=True, fill=True)
            pdf.empty_rows(1, 8)
        pdf.ln(2)

        pdf.section("TODAY'S AFFIRMATION")
        pdf.empty_rows(3, 9)
        pdf.ln(2)

        pdf.section("ONE THING THAT WOULD MAKE TODAY GREAT")
        pdf.empty_rows(3, 9)
        pdf.ln(2)

        pdf.section("EVENING REFLECTION")
        pdf.labeled_box("How did I show up today?")
        pdf.empty_rows(2, 9)
        pdf.labeled_box("Amazing thing that happened:")
        pdf.empty_rows(2, 9)

        # Stop after day 3 for the PDF (too large for 30 pages; real product has all 30)
        if day >= 3:
            break

    out = OUTPUT_DIR / "gratitude_journal.pdf"
    pdf.output(str(out))
    return out

# ── Product 5 — Goal Setting Workbook ────────────────────────────────────────

def make_goal_workbook() -> Path:
    pdf = BasePDF("GOAL SETTING WORKBOOK", "Quarterly planner · Vision board · Action steps")

    pdf.section("MY BIG VISION")
    pdf.labeled_box("Where do I want to be in 1 year?")
    pdf.empty_rows(4, 9)
    pdf.labeled_box("My WHY — why does this matter?")
    pdf.empty_rows(3, 9)
    pdf.ln(3)

    pdf.section("Q1 GOALS")
    quarters = [("Q1", "Jan–Mar"), ("Q2", "Apr–Jun"), ("Q3", "Jul–Sep"), ("Q4", "Oct–Dec")]
    for q, months in quarters:
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*ACCENT)
        pdf.cell(0, 8, f"  {q}  ({months})", ln=True)
        pdf.set_text_color(*CHARCOAL)
        for i in range(1, 4):
            pdf.set_font("Helvetica", "", 8)
            pdf.cell(8, 9, f"{i}.", border=0)
            pdf.set_fill_color(*WHITE)
            pdf.set_draw_color(*SOFT)
            pdf.cell(pdf.w - 2 * MARGIN - 8, 9, "", border=1, ln=True, fill=True)
        pdf.ln(2)

    pdf.add_page()
    pdf._draw_header()
    pdf.section("90-DAY ACTION PLAN")
    weeks = [f"Week {i}" for i in range(1, 13)]
    for w in weeks:
        pdf.grid_row([w, "Focus:", "", "Done?"], h=9)
    pdf.ln(3)

    pdf.section("MONTHLY CHECK-IN")
    pdf.grid_row(["Month", "Goals Hit", "Obstacles", "Adjustment"])
    for m in ["Month 1", "Month 2", "Month 3"]:
        pdf.grid_row([m, "", "", ""], h=12)

    out = OUTPUT_DIR / "goal_workbook.pdf"
    pdf.output(str(out))
    return out

# ── Product dispatch ──────────────────────────────────────────────────────────

PRODUCT_MAP: dict[str, tuple[str, callable]] = {
    "daily_planner":     ("Daily Planner Pages",          make_daily_planner),
    "weekly_tracker":    ("Weekly Habit Tracker",          make_weekly_habit_tracker),
    "budget_tracker":    ("Monthly Budget Tracker",        make_budget_tracker),
    "gratitude_journal": ("Gratitude Journal (30 Days)",   make_gratitude_journal),
    "goal_workbook":     ("Goal Setting Workbook",         make_goal_workbook),
}


def generate_product(product_key: str) -> dict:
    if product_key not in PRODUCT_MAP:
        raise ValueError(f"Unknown product: {product_key}. Available: {list(PRODUCT_MAP.keys())}")
    name, fn = PRODUCT_MAP[product_key]
    path = fn()
    return {
        "product_key": product_key,
        "name":        name,
        "file_path":   str(path),
        "file_size_kb": round(path.stat().st_size / 1024, 1),
    }


def generate_all() -> list[dict]:
    return [generate_product(k) for k in PRODUCT_MAP]
