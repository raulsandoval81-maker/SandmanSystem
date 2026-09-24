import { createHash, randomUUID } from "node:crypto";
import * as functions from "firebase-functions";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";

import {
  DocumentReference,
  DocumentSnapshot,
  FieldValue,
  Timestamp,
  getFirestore,
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

export const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const CLAIM_LEASE_MS = 5 * 60 * 1000;
const TRANSITION_MARKER = "appointment-confirmation-pending";

type SendClaim =
  | { state: "claimed"; claimId: string }
  | { state: "completed"; emailId: string }
  | { state: "busy" };

export function gatekeeperTransitionIdentity(
  leadId: string,
  afterUpdateTime: string
): string {
  return [leadId, afterUpdateTime, TRANSITION_MARKER].join(":");
}

export function gatekeeperTransitionHash(identity: string): string {
  return createHash("sha256").update(identity).digest("hex");
}

export function gatekeeperProviderIdempotencyKey(
  transitionHash: string
): string {
  return `gatekeeper-${transitionHash}`;
}

async function claimSend(
  deliveryRef: DocumentReference,
  transitionIdentity: string,
  transitionHash: string,
  leadId: string
): Promise<SendClaim> {
  const db = getFirestore();
  const claimId = randomUUID();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(deliveryRef);
    const existing = snap.data() || {};

    if (existing.status === "completed") {
      return {
        state: "completed",
        emailId: clean(existing.emailId),
      };
    }

    const leaseUntil = existing.leaseUntil?.toDate?.();
    if (
      existing.status === "processing" &&
      leaseUntil instanceof Date &&
      leaseUntil.getTime() > Date.now()
    ) {
      return { state: "busy" };
    }

    tx.set(
      deliveryRef,
      {
        transitionIdentity,
        transitionHash,
        transitionMarker: TRANSITION_MARKER,
        leadId,
        status: "processing",
        claimId,
        leaseUntil: Timestamp.fromMillis(Date.now() + CLAIM_LEASE_MS),
        attemptCount: FieldValue.increment(1),
        providerIdempotencyKey:
          gatekeeperProviderIdempotencyKey(transitionHash),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: existing.createdAt || FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { state: "claimed", claimId };
  });
}

async function markDeliveryFailed(
  deliveryRef: DocumentReference,
  claimId: string,
  message: string
) {
  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(deliveryRef);
    const delivery = snap.data() || {};

    if (
      delivery.status !== "processing" ||
      delivery.claimId !== claimId
    ) {
      return;
    }

    tx.set(
      deliveryRef,
      {
        status: "failed",
        lastError: message,
        leaseUntil: null,
        failedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

async function markDeliveryCompleted(
  deliveryRef: DocumentReference,
  claimId: string,
  emailId: string
) {
  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(deliveryRef);
    const delivery = snap.data() || {};

    if (delivery.status === "completed") {
      return;
    }

    if (
      delivery.status !== "processing" ||
      delivery.claimId !== claimId
    ) {
      throw new Error(
        "Gatekeeper delivery claim was lost before completion."
      );
    }

    tx.set(
      deliveryRef,
      {
        status: "completed",
        emailId,
        completedAt: FieldValue.serverTimestamp(),
        leaseUntil: null,
        lastError: "",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

async function syncConfirmationSent(
  leadRef: DocumentReference,
  appointmentRef: DocumentReference,
  emailId: string
) {
  await markConfirmationSent(leadRef, emailId);
  await markConfirmationSent(appointmentRef, emailId);
}

function snapshotUpdateTime(snapshot: DocumentSnapshot): string {
  const updateTime = snapshot.updateTime;
  if (!updateTime) {
    throw new Error("Gatekeeper snapshot update time is missing.");
  }

  return `${updateTime.seconds}.${String(updateTime.nanoseconds).padStart(9, "0")}`;
}

export async function handleGatekeeperUpdate(
  change: { before: DocumentSnapshot; after: DocumentSnapshot },
  leadIdInput: string,
  resendKey: string
): Promise<void> {
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

        const leadId = clean(leadIdInput);
        if (!leadId) {
          throw new Error("Gatekeeper lead identity is missing.");
        }

        const transitionIdentity =
          gatekeeperTransitionIdentity(
            leadId,
            snapshotUpdateTime(change.after)
          );
        const transitionHash =
          gatekeeperTransitionHash(transitionIdentity);
        const db = getFirestore();

        const appointmentRef =
          db
            .collection(
              "admissions_appointments"
            )
            .doc(
              leadId
            );

        const deliveryRef =
          db
            .collection("gatekeeperEmailDeliveries")
            .doc(transitionHash);

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

        const claim =
          await claimSend(
            deliveryRef,
            transitionIdentity,
            transitionHash,
            leadId
          );

        if (claim.state === "completed") {
          await syncConfirmationSent(
            change.after.ref,
            appointmentRef,
            claim.emailId
          );
          return;
        }

        if (claim.state === "busy") {
          throw new Error(
            "Gatekeeper email event is already being processed."
          );
        }

        let providerCompleted = false;

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
              .send(
                {
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
                },
                {
                  idempotencyKey:
                    gatekeeperProviderIdempotencyKey(transitionHash),
                }
              );

          if (result.error) {
            throw new Error(
              result.error.message ||
              "Resend rejected the appointment email."
            );
          }

          const emailId =
            result.data?.id || "";

          providerCompleted = true;

          /*
           * Record provider completion first.
           * A retry can recover this email ID and
           * finish either interrupted status write.
           */
          await markDeliveryCompleted(
            deliveryRef,
            claim.claimId,
            emailId
          );

          /*
           * Synchronize BOTH records.
           *
           * interest_leads drives Gatekeeper.
           * admissions_appointments drives the
           * Management appointment workspace.
           */
          await syncConfirmationSent(
            change.after.ref,
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

          if (!providerCompleted) {
            await markDeliveryFailed(
              deliveryRef,
              claim.claimId,
              message
            );

            /*
             * Preserve the existing failed status
             * only when Resend has not completed.
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

          /*
           * retry:true redelivers the same event.
           * The durable event record and Resend
           * idempotency key prevent a new send.
           */
          throw error;
        }
}

export const sendGatekeeperEmail = functions
  .runWith({
    secrets: [RESEND_API_KEY],
    failurePolicy: true,
  })
  .firestore.document("interest_leads/{leadId}")
  .onUpdate(async (change, context) => {
    await handleGatekeeperUpdate(
      change,
      clean(context.params.leadId),
      RESEND_API_KEY.value()
    );
  });

export const sendGatekeeperEmailV2 = onDocumentUpdated(
  {
    document: "interest_leads/{leadId}",
    secrets: [RESEND_API_KEY],
    retry: true,
  },
  async (event) => {
    const change = event.data;
    if (!change) return;

    await handleGatekeeperUpdate(
      change,
      clean(event.params.leadId),
      RESEND_API_KEY.value()
    );
  }
);
