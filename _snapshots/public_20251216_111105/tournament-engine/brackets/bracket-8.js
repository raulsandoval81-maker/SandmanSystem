// Header wiring
const preset = document.getElementById('eventPreset');
const eventInput = document.getElementById('eventNameInput');
const eventDisplay = document.getElementById('eventNameDisplay');
const metaInput = document.getElementById('metaInput');
const metaDisplay = document.getElementById('metaDisplay');

function updateEventName() {
  const name = eventInput.value.trim() || 'Event Name';
  eventDisplay.textContent = name.toUpperCase();
}

function updateMeta() {
  metaDisplay.textContent =
    metaInput.value.trim() || 'Division • Weight • 8-Man Double Elimination';
}

preset.addEventListener('change', () => {
  eventInput.value = preset.value;
  updateEventName();
});
eventInput.addEventListener('input', updateEventName);
metaInput.addEventListener('input', updateMeta);

updateEventName();
updateMeta();

// Winner highlight (not auto-advancing yet, just visual like Trackwrestling-lite)
document.querySelectorAll('.slot-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const slot = btn.closest('.slot');
    const match = btn.closest('.match');
    match.querySelectorAll('.slot').forEach((s) => s.classList.remove('winner'));
    slot.classList.add('winner');
  });
});

// Mock athletes for test run (seeds 1–8)
const mockAthletes = [
  { seed: 1, name: 'Aiden Cruz',   team: 'Lompoc' },
  { seed: 8, name: 'Noah Ramirez', team: 'Santa Maria' },
  { seed: 4, name: 'Jaxon Lee',    team: 'Lompoc' },
  { seed: 5, name: 'Eli Torres',   team: 'Arroyo Grande' },
  { seed: 2, name: 'Mason Diaz',   team: 'Lompoc' },
  { seed: 7, name: 'Logan Price',  team: 'Paso Robles' },
  { seed: 3, name: 'Caleb Ortiz',  team: 'Pioneer Valley' },
  { seed: 6, name: 'Riley James',  team: 'St. Joe' },
];

// Where each seed goes in the bracket
const seedToSlot = {
  1: 'qf1-a',
  8: 'qf1-b',
  4: 'qf2-a',
  5: 'qf2-b',
  2: 'qf3-a',
  7: 'qf3-b',
  3: 'qf4-a',
  6: 'qf4-b',
};

mockAthletes.forEach((a) => {
  const key = seedToSlot[a.seed];
  const slot = document.querySelector(`.slot[data-slot="${key}"]`);
  if (!slot) return;
  const seedEl = slot.querySelector('.seed');
  const nameEl = slot.querySelector('.slot-name');
  const teamEl = slot.querySelector('.slot-team');
  if (seedEl) seedEl.textContent = a.seed;
  if (nameEl) nameEl.textContent = a.name;
  if (teamEl) teamEl.textContent = a.team;
});
