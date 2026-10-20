/* SPDX-License-Identifier: Apache-2.0 */
/**
 * code-rules-ca.js — Bildra's California code check: the rules, as data. No DOM; code-check.js runs them.
 *
 * Edition: 2025 California Residential Code (Title 24, Part 2.5), in force from January 1, 2026, which renumbered
 * chapter 3 (stairs and doors R318, escape openings R319, handrails R320, guards R321, room areas R312, ceilings R313).
 *
 * What is here and what is not (owner, 2026-10-20: "do not make up"):
 *   - No code text is copied. Each rule holds the section number, the requirement in our own words, and the numbers
 *     the section sets (facts). `sources` lists where each number was read and on which day; a rule with one source
 *     says so (`sources.length === 1` shows as "one source" in the panel). tests/bin/test-bildra-code.mjs fails when a
 *     number in `limits` is not written in `rule` too, or a rule has no source.
 *   - Local amendments can be stricter than the state code (San Francisco and Oakland keep 7'-6" ceilings in
 *     habitable rooms, for one). The check is the state minimum, and the panel says so.
 *   - A rule the model cannot decide gives 'check' (with why), never a guess; rules the model cannot test at all are in
 *     NOT_CHECKED, shown in the panel, so nothing looks covered that is not.
 *
 * Limits are in inches (as the code sets them); IN converts. Lengths in the engine are millimetres.
 */
export const IN = 25.4;
export const FT = 12 * IN;

export const EDITION = { id: 'ca-crc-2025', name: '2025 California Residential Code', short: 'CRC 2025', effective: '2026-01-01' };

/** Where the numbers were read (2026-10-20). gcb = GoCodebook's reading of the 2025 CRC (read, not copied). */
export const SOURCES = {
  gcb312: { short: 'GoCodebook R312', title: 'GoCodebook: 2025 CRC R312 Minimum Room Areas', url: 'https://gocodebook.com/library/us/ca/ca-residential-code/chapter-3-building-planning/section-r312-minimum-room-areas' },
  gcb313: { short: 'GoCodebook R313', title: 'GoCodebook: 2025 CRC R313 Ceiling Height', url: 'https://gocodebook.com/library/us/ca/ca-residential-code/chapter-3-building-planning/section-r313-ceiling-height' },
  gcb318: { short: 'GoCodebook R318', title: 'GoCodebook: 2025 CRC R318 Means of Egress', url: 'https://gocodebook.com/library/us/ca/ca-residential-code/chapter-3-building-planning/section-r318-means-of-egress' },
  gcb319: { short: 'GoCodebook R319', title: 'GoCodebook: 2025 CRC R319 Emergency Escape and Rescue Openings', url: 'https://gocodebook.com/library/us/ca/ca-residential-code/chapter-3-building-planning/section-r319-emergency-escape-and-rescue-openings' },
  gcb320: { short: 'GoCodebook R320', title: 'GoCodebook: 2025 CRC R320 Handrails', url: 'https://gocodebook.com/library/us/ca/ca-residential-code/chapter-3-building-planning/section-r320-handrails' },
  gcb321: { short: 'GoCodebook R321', title: 'GoCodebook: 2025 CRC R321 Guards and Window Fall Protection', url: 'https://gocodebook.com/library/us/ca/ca-residential-code/chapter-3-building-planning/section-r321-guards-and-window-fall-protection' },
  gilroy: { short: 'Gilroy handout 2025', title: 'City of Gilroy: Residential Stairways, Handrails and Guards (rev. 03/03/2025, 2022 CRC numbering)', url: 'https://cityofgilroy.org/DocumentCenter/View/12314/Residential-Stairs-Handrails-and-Guards-Handout' },
  sonoma: { short: 'Permit Sonoma CNI-020', title: 'Permit Sonoma CNI-020: Emergency Escape and Rescue Windows', url: 'https://permitsonoma.org/instructionsandforms/cni-020emergencyescapeandrescuewindows' },
  woodside: { short: 'Woodside 2025 form', title: 'Town of Woodside: 2025 CRC Smoke and Carbon Monoxide Alarm Self-Certification', url: 'https://www.woodsideca.gov/DocumentCenter/View/123' },
  laguna: { short: 'Laguna Hills handout', title: 'City of Laguna Hills: Dwelling Design handout (2022 code, rev. 02-2023)', url: 'https://www.lagunahillsca.gov/DocumentCenter/View/7848/Dwelling-Design' },
  elcentro: { short: 'El Centro ADU handout', title: 'City of El Centro: Accessory Dwelling Unit handout', url: 'https://cityofelcentro.org/communitydevelopment/wp-content/uploads/sites/14/2023/04/Accessory-Dwelling-Unit-ADU-El-Centro.pdf' },
  hawthorne: { short: 'Hawthorne handout', title: 'City of Hawthorne: residential egress door handout', url: 'https://cityofhawthorne.org/home/showpublisheddocument/5955/638573200096930000' },
  ashi: { short: 'ASHI Golden Gate', title: 'ASHI Golden Gate Chapter: ceiling height (state 7 ft, some cities 7 ft 6 in)', url: 'https://ggashi.starchapter.com/images/downloads/Resources/ceiling_press_release_final_version.pdf' },
};

/**
 * One rule: { id, section, topic, rule (our words, with every number in `limits`), limits {name: inches | square feet},
 * sources [keys of SOURCES], note? }. `topic` picks the engine's test (code-check.js TESTS).
 */
export const RULES = [
  { id: 'stair-riser', section: 'R318.7.5.1', topic: 'stair', rule: 'Stair risers 7 3/4 in. high at most.', limits: { riserMax: 7.75 }, sources: ['gcb318', 'gilroy'] },
  { id: 'stair-tread', section: 'R318.7.5.2', topic: 'stair', rule: 'Stair treads 10 in. deep at least.', limits: { treadMin: 10 }, sources: ['gcb318', 'gilroy'] },
  { id: 'stair-width', section: 'R318.7.1', topic: 'stair', rule: 'Stairways 36 in. wide at least (clear, above the handrails).', limits: { widthMin: 36 }, sources: ['gcb318', 'gilroy'],
    note: 'The model gives the stair\'s width; the clear width is measured between finished walls or rails.' },
  { id: 'stair-rise', section: 'R318.7.3', topic: 'stair', rule: 'One flight rises 151 in. (12 ft 7 in.) at most between floors or landings.', limits: { riseMax: 151 }, sources: ['gcb318', 'gilroy'] },
  { id: 'stair-handrail', section: 'R318.7.8', topic: 'stair', rule: 'A handrail on at least one side of every flight with 4 or more risers.', limits: { risersForRail: 4 }, sources: ['gcb318', 'gilroy'] },
  { id: 'spiral', section: 'R318.7.11.1', topic: 'spiral', rule: 'Spiral stairs: 26 in. clear width, treads 6 3/4 in. deep at the walkline, risers 9 1/2 in. at most.',
    limits: { widthMin: 26, treadMin: 6.75, riserMax: 9.5 }, sources: ['gcb318'] },
  { id: 'handrail-height', section: 'R320.2', topic: 'handrail', rule: 'Handrails 34 in. to 38 in. above the line of the stair nosings.', limits: { railMin: 34, railMax: 38 }, sources: ['gcb320', 'gilroy'],
    note: 'Read from the handrail\'s height property; the model\'s shape alone does not give the height above the nosings.' },
  { id: 'guard-height', section: 'R321.1.2', topic: 'guard', rule: 'Guards 42 in. high at least; 34 in. on the open side of stairs.', limits: { guardMin: 42, stairGuardMin: 34 }, sources: ['gcb321', 'gilroy'] },
  { id: 'egress-door', section: 'R318.2', topic: 'egressDoor', rule: 'At least one side-hinged egress door per dwelling: 32 in. clear width and 78 in. clear height.',
    limits: { clearWidthMin: 32, clearHeightMin: 78 }, sources: ['gcb318', 'hawthorne'],
    note: 'Clear width is from the face of the open door to the stop, so it is less than the door\'s size: a door smaller than 32 in. fails; a larger one needs its clear width confirmed. The 78 in. height has one source.' },
  { id: 'hallway', section: 'R318.6', topic: 'hallway', rule: 'Hallways 3 ft (36 in.) wide at least.', limits: { widthMin: 36 }, sources: ['gcb318', 'laguna'] },
  { id: 'room-area', section: 'R312.1', topic: 'roomArea', rule: 'Habitable rooms 70 sq ft at least (kitchens excepted).', limits: { areaMin: 70 }, sources: ['gcb312', 'elcentro'] },
  { id: 'room-dimension', section: 'R312.2', topic: 'roomDim', rule: 'Habitable rooms 7 ft (84 in.) at least in every horizontal direction (kitchens excepted).', limits: { dimMin: 84 }, sources: ['gcb312', 'laguna'] },
  { id: 'ceiling', section: 'R313.1', topic: 'ceiling', rule: 'Ceilings 7 ft (84 in.) high at least in habitable rooms and hallways; 6 ft 8 in. (80 in.) in bathrooms, toilet rooms and laundry rooms.',
    limits: { habitableMin: 84, wetMin: 80 }, sources: ['gcb313', 'ashi'],
    note: 'The state minimum. Some cities require more (7 ft 6 in. in San Francisco and Oakland habitable rooms).' },
  { id: 'escape-opening', section: 'R319.2', topic: 'escape', rule: 'Every sleeping room has an emergency escape opening: 5.7 sq ft net clear (5 sq ft at grade floor), 24 in. clear height, 20 in. clear width, bottom of the opening 44 in. at most above the floor.',
    limits: { areaMin: 5.7, areaGradeMin: 5, heightMin: 24, widthMin: 20, sillMax: 44 }, sources: ['gcb319', 'sonoma'],
    note: 'The net clear opening depends on how the window opens. A window whose overall size is already too small fails; otherwise the clear opening is to be confirmed from the maker\'s data.' },
  { id: 'smoke-alarm', section: 'R310', topic: 'smoke', rule: 'Smoke alarms in each sleeping room, outside each sleeping area, and on each story.', limits: {}, sources: ['woodside', 'laguna'],
    note: 'Bildra checks each sleeping room and each story; "outside each sleeping area" is not checked.' },
];

/** Rules in the same sections the model cannot test: listed in the panel, so they are not taken as passed. */
export const NOT_CHECKED = [
  { section: 'R318.7.2', what: 'Stair headroom (6 ft 8 in.)' },
  { section: 'R318.7.5.1–.2', what: 'Riser and tread differences within a flight (3/8 in.), open risers (4 in. sphere)' },
  { section: 'R318.7.5.3', what: 'Nosings' },
  { section: 'R318.7.6', what: 'Stair landings' },
  { section: 'R318.3', what: 'Landings at exterior doors' },
  { section: 'R321.1.1', what: 'Where guards are required (more than 30 in. above the floor or grade below)' },
  { section: 'R321.1.3', what: 'Guard openings (4 in. sphere)' },
  { section: 'R321.2', what: 'Window fall protection' },
  { section: 'R311', what: 'Carbon monoxide alarms (depend on fuel-burning appliances and an attached garage)' },
  { section: 'R309', what: 'Automatic fire sprinklers' },
  { section: 'R324', what: 'Safety glazing' },
  { section: 'R327', what: 'Toilet, bath and shower spaces (fixture spacing is in the California Plumbing Code)' },
];

/** Room names → kinds (English, lower case, whole words). A room's kind decides which rules apply; unknown names are
 *  not judged as habitable rooms. Wet rooms first: "master bath" is a bathroom. */
export const ROOM_KINDS = [
  { kind: 'wet', words: ['bath', 'bathroom', 'toilet', 'wc', 'powder', 'laundry', 'restroom', 'shower'] },
  { kind: 'sleeping', words: ['bed', 'bedroom', 'bedrm', 'br', 'sleeping', 'nursery', 'guest room', 'master'] },
  { kind: 'kitchen', words: ['kitchen', 'kitchenette'] },
  { kind: 'hallway', words: ['hall', 'hallway', 'corridor', 'passage'] },
  { kind: 'habitable', words: ['living', 'family', 'dining', 'den', 'office', 'study', 'great room', 'library', 'media', 'game', 'play', 'bonus', 'lounge', 'sitting'] },
];
