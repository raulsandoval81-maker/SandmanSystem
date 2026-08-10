import * as functions from "firebase-functions";

import {
  getFirestore
} from "firebase-admin/firestore";

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

        /*
         * Gatekeeper only sends when the
         * confirmation state enters "pending".
         */
        if (
          afterStatus !== "pending"
        ) {
          return;
        }

        /*
         * Prevent duplicate sends.
         *
         * If the document was already pending
         * before this update, Gatekeeper does
         * nothing.
         */
        if (
          beforeStatus === "pending"
        ) {
          return;
        }

        const leadId =
          clean(
            context.params.leadId
          );

        const appointmentRef =
          getFirestore()
            .collection(
              "admissions_appointments"
            )
            .doc(
              leadId
            );

        const parentEmail =
          clean(
            after.email
          ).toLowerCase();

        /*
         * Missing recipient email
         */
        if (!parentEmail) {
          const message =
            "Missing parent email address.";

          console.error(
            "[gatekeeper] Missing parent email:",
            leadId
          );

          await markConfirmationFailed(
            change.after.ref,
            message
          );

          await markConfirmationFailed(
            appointmentRef,
            message
          );

          return;
        }

        const resendKey =
          functions
            .config()
            .resend?.key;

        /*
         * Missing Resend configuration
         */
        if (!resendKey) {
          const message =
            "Missing Resend API key.";

          console.error(
            "[gatekeeper] Missing Resend API key"
          );

          await markConfirmationFailed(
            change.after.ref,
            message
          );

          await markConfirmationFailed(
            appointmentRef,
            message
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

          const emailId =
            result.data?.id || "";

          /*
           * Synchronize BOTH records.
           *
           * interest_leads drives Gatekeeper.
           * admissions_appointments drives the
           * Management appointment workspace.
           */
          await markConfirmationSent(
            change.after.ref,
            emailId
          );

          await markConfirmationSent(
            appointmentRef,
            emailId
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

              emailId
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

          /*
           * Keep Management and the lead
           * record synchronized on failure too.
           */
          await markConfirmationFailed(
            change.after.ref,
            message
          );

          await markConfirmationFailed(
            appointmentRef,
            message
          );
        }
      }
    );