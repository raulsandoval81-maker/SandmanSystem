const text = value => String(value ?? "").trim();

export function cardIdentity(card = {}) {
  return text(card.cardId || card.id || card.href || card.skillId || card.skill || card.familyId || card.family || card.title);
}

export function isCardCompatibleWithGroup(card = {}, group = {}) {
  const sameWhenKnown = (left, right) => !text(left) || !text(right) || text(left).toLowerCase() === text(right).toLowerCase();
  const cardJourney = text(card.journey).toLowerCase().replace("z2h", "r2c");
  const groupJourney = text(group.journey).toLowerCase().replace("z2h", "r2c");
  return sameWhenKnown(card.discipline, group.discipline)
    && sameWhenKnown(cardJourney, groupJourney)
    && sameWhenKnown(card.tier, group.instructionalTier || group.tier);
}

export function buildApprovedCatalog(groups = [], sources = []) {
  const byCard = new Map();
  for (const source of sources) {
    const group = groups.find(item => text(item.id) === text(source.groupId));
    for (const sourceCard of Array.isArray(source.cards) ? source.cards : []) {
      if (!group || !isCardCompatibleWithGroup(sourceCard, group)) continue;
      const id = cardIdentity(sourceCard);
      if (!id) continue;
      const key = JSON.stringify([id, text(sourceCard.href), text(sourceCard.title)]);
      const current = byCard.get(key) || {
        ...sourceCard,
        id,
        cardId: id,
        provenance: text(sourceCard.provenance || source.provenance || "approved-curriculum"),
        compatibleGroupIds: [],
      };
      if (!current.compatibleGroupIds.includes(group.id)) current.compatibleGroupIds.push(group.id);
      byCard.set(key, current);
    }
  }
  return [...byCard.values()];
}

export function normalizeClipboardPlan(plan = {}, practiceId = "") {
  const blocks = (Array.isArray(plan.blocks) ? plan.blocks : []).map((block, index) => ({
    slot: text(block.slot) || `block-${index + 1}`,
    title: text(block.title || block.label),
    minutes: Math.max(0, Number(block.minutes) || 0),
    notes: text(block.notes ?? block.text),
    visible: block.visible !== false,
    timer: {
      pack: text(block.timer?.pack), preset: text(block.timer?.preset), label: text(block.timer?.label),
      execution: block.timer?.execution ? {
        rounds: Math.max(0, Math.floor(Number(block.timer.execution.rounds) || 0)),
        workSeconds: Math.max(0, Math.floor(Number(block.timer.execution.workSeconds) || 0)),
        restSeconds: Math.max(0, Math.floor(Number(block.timer.execution.restSeconds) || 0)),
        warningSeconds: Math.max(0, Math.floor(Number(block.timer.execution.warningSeconds) || 0)),
        linkedSkillIds: [...new Set((block.timer.execution.linkedSkillIds || []).map(text).filter(Boolean))],
      } : null,
    },
    cards: (Array.isArray(block.cards) ? block.cards : []).map(card => ({
      id: cardIdentity(card), cardId: cardIdentity(card), title: text(card.title), href: text(card.href),
      skill: text(card.skill || card.skillId), family: text(card.family || card.familyId),
      tier: text(card.tier), journey: text(card.journey), discipline: text(card.discipline),
      category: text(card.category), lane: text(card.lane || block.slot),
      provenance: text(card.provenance),
      groupIds: [...new Set((card.groupIds || (card.groupId ? [card.groupId] : [])).map(text).filter(Boolean))],
      athleteIds: [...new Set((card.athleteIds || []).map(text).filter(Boolean))],
    })).filter(card => card.id && card.title),
    drillBlocks: Array.isArray(block.drillBlocks) ? block.drillBlocks : [],
  })).filter(block => block.slot && block.minutes > 0);
  return {
    version: 1,
    practiceId: text(practiceId || plan.practiceId),
    schema: text(plan.schema),
    focus: text(plan.focus),
    blocks,
    flexibleOrder: (plan.flexibleOrder || blocks.map(block => block.slot)).map(text).filter(Boolean),
  };
}

export function planReadiness(plan = {}, groups = []) {
  const normalized = normalizeClipboardPlan(plan, plan.practiceId);
  const groupIds = new Set(groups.map(group => text(group.id)).filter(Boolean));
  const review = [];
  if (!normalized.blocks.length) review.push("Add at least one practice block.");
  for (const block of normalized.blocks) {
    if (!block.cards.length && /^(drills|technique|live)$/i.test(block.slot)) review.push(`${block.title || block.slot} needs an activity or Coach note.`);
    for (const card of block.cards) {
      if (!card.provenance) review.push(`${card.title} is missing curriculum provenance.`);
      if (groupIds.size && !card.groupIds.length) review.push(`${card.title} needs a group assignment.`);
      if (card.groupIds.some(id => !groupIds.has(id))) review.push(`${card.title} references a group outside this practice.`);
    }
  }
  return { ready: review.length === 0, review: [...new Set(review)], totalMinutes: normalized.blocks.reduce((sum, block) => sum + block.minutes, 0) };
}

export function canonicalRestoreDecision({ requestedPracticeId, canonicalPracticeId, restored }) {
  const requested = text(requestedPracticeId);
  return {
    allowLocalFallback: !requested,
    blocked: Boolean(requested && (!restored || text(canonicalPracticeId) !== requested)),
  };
}
