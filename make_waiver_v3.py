# make_waiver_v3.py — Sandman Waiver (2 pages, canvas-only)

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch

def draw_signature_line(c, label, y):
    c.setFont("Helvetica", 10)
    c.drawString(1 * inch, y, f"{label} Signature: ________________________")
    c.drawString(4.5 * inch, y, "Date: ___________")

def add_block(c, lines, start_y, leading=13, font="Helvetica", size=11):
    """Write a list of short lines starting at (1in, start_y). Returns final y."""
    t = c.beginText(1 * inch, start_y)
    t.setFont(font, size)
    t.setLeading(leading)
    for line in lines:
        t.textLine(line)
    c.drawText(t)
    return t.getY()

def build_waiver(filename):
    c = canvas.Canvas(filename, pagesize=letter)
    width, height = letter

    # =========================
    # PAGE 1 — Legal & Liability
    # =========================
    y = height - 1 * inch

    # Header
    y = add_block(c, [
        "SANDMAN SYSTEM™ / SANDMAN COMBAT™",
        "Parent/Guardian Waiver & Release of Liability",
        "Covers participation in Sandman Combat™ training & activities",
        "(wrestling, boxing, kickboxing, submission grappling, strength/conditioning).",
        ""
    ], y, leading=15, font="Helvetica-Bold", size=12)

    # Prefill block (kept as lines; UI can auto-fill later if desired)
    y = add_block(c, [
        "Team / Club: ___________________________",
        "City, State: ___________________________",
        "Athlete Name: ___________________________",
        "Date of Birth: ___________________________",
        ""
    ], y, leading=14)

    # Sections 1–9
    y = add_block(c, [
        "1) Assumption of Risk",
        "I understand that combat sports involve inherent risks including slips, falls, sprains,",
        "broken bones, concussion, and other serious injury. I voluntarily choose to allow my",
        "athlete to participate and accept responsibility for all risks.",
        "",
        "2) Release & Hold Harmless",
        "I, on behalf of myself and the participant, release and hold harmless Sandman System™,",
        "Sandman Combat™, its owners, staff, volunteers, and affiliates from any claims arising",
        "from participation, except in cases of gross negligence or willful misconduct.",
        "",
        "3) Membership Cards & Insurance",
        "Certain competitions may require USA Wrestling, USA Boxing, or AAU membership.",
        "Parents/guardians are responsible for maintaining any required memberships.",
        "Proof may be requested before tournaments. Day-to-day practice is not contingent,",
        "but competition eligibility may be denied without it.",
        "",
        "4) Medical Authorization",
        "I certify the participant is fit to engage in sport. I authorize staff to render basic first aid",
        "and secure emergency treatment as needed. I am responsible for related costs.",
        "",
        "5) Media Consent (optional)",
        "I grant permission to use participant likeness (photos/video) for program promotion.",
        "",
        "6) Transportation",
        "I consent to reasonable transportation by approved staff/volunteers when communicated.",
        "",
        "7) Code of Conduct & Facility Rules",
        "I agree athlete and family will follow all rules and standards. Violation may result in",
        "removal without refund to protect safety and culture.",
        "",
        "8) Dual Progression & Fast-Track",
        "Any exception pathway is subject to management review within 48 hours and may include",
        "private/non-ceremonial acknowledgments until backfilled upward.",
        "",
        "9) Acknowledgment",
        "I have read and understand this waiver. I am the parent/guardian of the participant and",
        "have authority to sign. I may ask questions at any time.",
        ""
    ], y, leading=13)

    # Signature bottom of page 1
    draw_signature_line(c, "Parent/Guardian", 1 * inch)
    c.showPage()

    # =============================
    # PAGE 2 — Culture & Standards
    # =============================
    y = height - 1 * inch
    y = add_block(c, ["Culture & Standards", ""], y, leading=16, font="Helvetica-Bold", size=12)

    # Parent Culture (compact paragraphs)
    y = add_block(c, [
        "Parent Creed — to my athlete",
        "I will support the growth of my athlete with patience, respect, and encouragement.",
        "I understand that combat sports demand commitment, consistency, and honor, and I will",
        "stand by my athlete through the ups and downs of the journey.",
        ""
    ], y)

    y = add_block(c, [
        "Parent Code — to myself",
        "I commit to modeling discipline, respect, and integrity in and out of the gym.",
        "I will back the coaches, reinforce the rules, and set the standard at home and in the",
        "community, knowing my actions shape the culture my athlete grows in.",
        ""
    ], y)

    y = add_block(c, [
        "Parent Goal — to the now",
        "To create an environment where my athlete can thrive, learn resilience, and grow stronger",
        "in body, character, and honor. Today’s habits shape tomorrow’s outcomes.",
        ""
    ], y)

    y = add_block(c, [
        "Parent Mission — to the then",
        "To partner with Sandman Combat™ in raising athletes who succeed not only in sport,",
        "but also in school, family, and life. Respect, accountability, and culture extend beyond",
        "the mat, and I will uphold these values as we build for the future.",
        ""
    ], y)

    # Spacer
    y -= 6

    # Athlete Rules of Life (long form)
    y = add_block(c, ["Athlete Rules of Life", ""], y, leading=16, font="Helvetica-Bold", size=12)

    y = add_block(c, [
        "Rule #1 — Focus",
        "Focus up. Eyes up, ears open. Excellence is in the details. Pay attention to the details",
        "and excellence will come. See it. Feel it. Do it.",
        ""
    ], y)

    y = add_block(c, [
        "Rule #2 — Effort",
        "Always try. Nothing great comes without great effort. Nothing good comes without it either.",
        "Repetition is the mother of all learning.",
        ""
    ], y)

    y = add_block(c, [
        "Rule #3 — Attitude",
        "Control your emotions. Stay steady when it’s hard. Mind over matter. No whining, no crying,",
        "no excuses, no blaming others. Take ownership in everything you do. Attitude is everything.",
        ""
    ], y)

    y = add_block(c, [
        "Rule #4 — Respect",
        "Give respect to get respect. Treat others as you want to be treated. Without respect, we have",
        "no trust. Without trust, we have nothing. Respect the fight. Trust the process.",
        ""
    ], y)

    y = add_block(c, [
        "Athlete Responsibility",
        "These Rules of Life apply not only in the gym, but also in the classroom and the community —",
        "in sport and outside of sport, in battle and in life. I accept responsibility for my actions,",
        "choices, and behavior both inside and outside the program.",
        ""
    ], y)

    # Signature bottom of page 2
    draw_signature_line(c, "Parent/Guardian", 1 * inch)

    c.save()

# Run directly
if __name__ == "__main__":
    build_waiver("public/waiver/sandman-waiver-v3.pdf")
