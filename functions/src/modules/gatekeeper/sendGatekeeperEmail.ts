import * as functions from "firebase-functions";

import {
  Resend
} from "resend";

import {
  AppointmentLead
} from "./appointment/appointmentTypes";

import {
  clean
} from "./appointment/appointmentFormatting";

import {
  buildAppointmentEmail
} from "./appointment/buildAppointmentEmail";

import {
  markConfirmationFailed,
  markConfirmationSent
} from "./appointment/appointmentStatus";

export const sendGatekeeperEmail =
  functions.firestore
    .document(
      "interest_leads/{leadId}"
    )
    .onUpdate(
      async (
        change,
        context
      ) => {
const before =
  change.before.data() as AppointmentLead;

const after =
  change.after.data() as AppointmentLead;

        const beforeStatus =
          clean(
            before
              .appointmentConfirmationStatus
          );

        const afterStatus =
          clean(
            after
              .appointmentConfirmationStatus
          );

        if (
          afterStatus !== "pending"
        ) {
          return;
        }

        if (
          beforeStatus === "pending"
        ) {
          return;
        }

        const leadId =
          clean(
            context.params.leadId
          );

        const parentEmail =
          clean(
            after.email
          ).toLowerCase();

        if (!parentEmail) {
          console.error(
            "[gatekeeper] Missing parent email:",
            leadId
          );

          await markConfirmationFailed(
            change.after.ref,
            "Missing parent email address."
          );

          return;
        }

        const resendKey =
          functions
            .config()
            .resend?.key;

        if (!resendKey) {
          console.error(
            "[gatekeeper] Missing Resend API key"
          );

          await markConfirmationFailed(
            change.after.ref,
            "Missing Resend API key."
          );

          return;
        }

        try {
const email =
  buildAppointmentEmail(
    after
  );

          const resend =
            new Resend(
              resendKey
            );

const result =
  await resend
    .emails
    .send({
      from:
        "Sandman Combat <join@sandmancombat.com>",

      replyTo:
        "joinsandmancombat@gmail.com",

      to:
        parentEmail,

      subject:
        email.subject,

      text:
        email.text,

      html:
        email.html
    });

            if (result.error) {
            throw new Error(
              result.error.message ||
              "Resend rejected the appointment email."
            );
          }

          await markConfirmationSent(
            change.after.ref,
            result.data?.id || ""
          );

          console.log(
            "[gatekeeper] Appointment confirmation sent:",
            {
              leadId,
              parentEmail,
              appointmentDate:
                after.appointmentDate,
              appointmentTime:
                after.appointmentTime,
              appointmentLocation:
                after.appointmentLocation,
              appointmentCoach:
                after.appointmentCoach,
              emailId:
                result.data?.id || ""
            }
          );
        } catch (
          error: unknown
        ) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to send appointment confirmation.";

          console.error(
            "[gatekeeper] Appointment email failed:",
            leadId,
            error
          );

          await markConfirmationFailed(
            change.after.ref,
            message
          );
        }
      }
    );
