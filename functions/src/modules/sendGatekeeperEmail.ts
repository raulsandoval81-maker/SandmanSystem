import * as functions from "firebase-functions";
import { Resend } from "resend";

function buildEmail(entryType: string) {
  const scheduleBlock = `Location:
Lompoc High School Wrestling Room  
515 W College Ave  
Lompoc, CA 93436

Practice Schedule:
Monday, Wednesday, Friday

Elementary (Ages 7–10): 4:00–4:45 PM  
Junior High (Ages 10–13): 4:45–6:00 PM  
High School (Ages 13–18): 6:00–7:30 PM  

Check in with Coach when you arrive.`;

  if (entryType === "free_pass") {
    return {
      subject: "Sandman Combat — 1-Day Assessment",
      text: `Welcome — you’re one step away.

Come in for a 1-Day Assessment and train with us.

Check in with Coach when you arrive.

${scheduleBlock}`
    };
  }

  if (entryType === "trial") {
    return {
      subject: "Sandman Combat — 3-Day Trial",
      text: `Your 3-Day Trial is ready.

Come in for your first session and check in with Coach.

Payment is handled in person.

${scheduleBlock}`
    };
  }

  return {
    subject: "Sandman Combat — Welcome",
    text: `Welcome — you’re one step away.

Come in for a 1-Day Assessment and train with us.

At the end of the session, Coach will determine the next step.

${scheduleBlock}`
  };
}

export const sendGatekeeperEmail = functions.firestore
  .document("paraParentInbox/{id}")
  .onCreate(async (snap) => {
    const data = snap.data();

    if (data.category !== "join") return;
    if (!data.parentEmail) return;

    const resendKey = functions.config().resend?.key;

    if (!resendKey) {
      console.error("Missing Resend API key");
      return;
    }

    const resend = new Resend(resendKey);
    const email = buildEmail(data.entryType || "join");

    await resend.emails.send({
      from: "Sandman Combat <onboarding@resend.dev>",
      to: data.parentEmail,
      subject: email.subject,
      text: email.text
    });
  });