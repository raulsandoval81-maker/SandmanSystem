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
        "8) Acknowledgment",
        "I have read and understand this waiver. I am the parent/guardian of the participant and",
        "have authority to sign. I may ask questions at any time.",
        ""
    ], y, leading=13)

    # Signature bottom of page 1
    draw_signature_line(c, "Parent/Guardian", 1 * inch)
    c.showPage()

    # =============================
    # PAGE 2 — Academy Policies
    # =============================
    y = height - 1 * inch

    y = add_block(c, [
        "Academy Policies & Expectations",
        ""
    ], y, leading=16, font="Helvetica-Bold", size=12)

    y = add_block(c, [
        "Training Environment & Observation Policy",
        "Sandman Combat™ is designed to provide athletes with a focused, supportive,",
        "and low-pressure environment where they can learn, make mistakes, build",
        "confidence, and develop independence.",
        "",
        "Parents and guardians who are new to the program are welcome to remain",
        "nearby while their athlete becomes comfortable in the training environment.",
        "",
        "As athletes become comfortable and capable of participating independently,",
        "practices become coach-directed training environments. At that point,",
        "spectators may be limited or restricted at the discretion of the coaching staff.",
        "",
        "Practice is where athletes learn, experiment, and improve. Competition,",
        "testing, and events are where athletes demonstrate their work.",
        "",
        "Instruction is provided by the coaching staff. Sideline coaching, instruction",
        "from spectators, or interference with training is not permitted.",
        ""
    ], y)

    y = add_block(c, [
        "Team Standards",
        "Athletes are expected to uphold the following standards during training",
        "and competition:",
        "",
        "Focus — Be present and pay attention.",
        "Effort — Give your best effort.",
        "Attitude — Take ownership of your actions and responses.",
        "Respect — Respect coaches, teammates, opponents, officials, and facilities.",
        "",
        "These standards help create a safe, productive, and positive training",
        "environment for everyone involved.",
        ""
    ], y)

    y = add_block(c, [
        "Acknowledgment",
        "I acknowledge that I have received, read, and understand these academy",
        "policies and expectations and agree to support them as a participant,",
        "parent, or guardian.",
        ""
    ], y)

    # Signature bottom of page 2
    draw_signature_line(c, "Participant / Parent-Guardian", 1 * inch)

    c.save()

# Run directly
if __name__ == "__main__":
    build_waiver("public/waiver/sandman-waiver-v3.pdf")
