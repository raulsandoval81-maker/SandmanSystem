import {
  writeParentInbox
} from "./writeParentInbox";

import {
  buildParentMessage
} from "./buildParentMessage";

import {
  ParentSignalType
} from "./parentSignalTypes";

type SendParentSignalInput = {
  parentUid: string;
  athleteId?: string;
  athleteName?: string;

  type: ParentSignalType;

  testingDate?: string;
  nextTier?: string;
  note?: string;

  source?: string;
  sourceId?: string;
};

export async function sendParentSignal(
  input: SendParentSignalInput
) {
  const built =
    buildParentMessage({
      type: input.type,
      athleteName: input.athleteName,
      testingDate: input.testingDate,
      nextTier: input.nextTier,
      note: input.note,
    });

  return writeParentInbox({
    parentUid: input.parentUid,
    athleteId: input.athleteId,
    athleteName: input.athleteName,

    type: input.type,

    title: built.title,
    message: built.message,

    source: input.source,
    sourceId: input.sourceId,
  });
}