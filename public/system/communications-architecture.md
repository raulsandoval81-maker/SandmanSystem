# Communications System

## UI Layer
/public/communications/

## Messaging Engine
paraParentInbox

## Threads
paraParentInbox/{threadId}/thread

## Forms (separate)
contact_submissions
volunteer_submissions

## Rules
- UI naming does not require backend rename
- Do NOT rename Firestore collections without migration
- Inbox != form submissions