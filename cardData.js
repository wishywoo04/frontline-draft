// cardData.js
// -----------------------------------------------------------------------
// Starter roster: 18 unique cards. This is intentionally built to be
// EASY TO EXTEND — see the "Adding new cards" section in README.md.
// Every card follows the same shape so gameLogic.js never needs special
// cases per-card; behaviour comes entirely from these fields.
//
// Fields:
//   id            unique string key
//   name          display name
//   category      Attack | Defense | Healing | Buff | Debuff | Utility | Special
//   art           emoji placeholder (swap for real art later)
//   hp            starting/max hit points
//   moveRange     tiles it can move per Move action (4-directional)
//   atkRange      max distance for its basic attack. 1 = melee only.
//                 >1 = can Shoot at range OR Melee if adjacent.
//   atkDmg        damage dealt by a basic Melee/Shoot action
//   description   short flavour/rules text shown on the card
//   special: {
//     name, description,
//     energyCost  energy required to activate
//     type        'damage' | 'heal' | 'armor' | 'poison' | 'stun' |
//                 'slow' | 'buffAtk' | 'energySteal' | 'destroyArmor' |
//                 'duplicate'
//     amount      magnitude (damage/heal/armor/poison-per-turn/slow amt/atk buff)
//     duration    turns the effect lasts (for poison/slow/buffAtk/stun)
//     range       max distance from the unit to a legal target
//     targetType  'enemyUnit' | 'allyUnit' | 'enemyBase' | 'self' | 'anyUnit'
//   }
// -----------------------------------------------------------------------

const CARD_DEFS = [
  {
    id: 'ember_scout', name: 'Ember Scout', category: 'Attack', art: '🔥',
    hp: 10, moveRange: 3, atkRange: 1, atkDmg: 4,
    description: 'A quick skirmisher that darts across the field.',
    special: { name: 'Firebolt', description: 'Hurl fire at a distant enemy.', energyCost: 2, type: 'damage', amount: 5, range: 3, targetType: 'enemyUnit' },
  },
  {
    id: 'frost_archer', name: 'Frost Archer', category: 'Attack', art: '❄️',
    hp: 9, moveRange: 2, atkRange: 3, atkDmg: 4,
    description: 'Picks off targets from a safe distance.',
    special: { name: 'Frost Shot', description: 'Chills a foe, slowing its next moves.', energyCost: 2, type: 'slow', amount: 1, duration: 2, range: 3, targetType: 'enemyUnit' },
  },
  {
    id: 'stone_guardian', name: 'Stone Guardian', category: 'Defense', art: '🗿',
    hp: 22, moveRange: 1, atkRange: 1, atkDmg: 2,
    description: 'Slow but nearly impossible to knock down.',
    special: { name: 'Fortify', description: 'Raises a shield of stone around itself.', energyCost: 2, type: 'armor', amount: 6, range: 0, targetType: 'self' },
  },
  {
    id: 'shadow_blade', name: 'Shadow Blade', category: 'Attack', art: '🗡️',
    hp: 9, moveRange: 4, atkRange: 1, atkDmg: 5,
    description: 'Strikes hard and moves on before anyone reacts.',
    special: { name: 'Ambush', description: 'A vicious surprise strike.', energyCost: 3, type: 'damage', amount: 8, range: 1, targetType: 'enemyUnit' },
  },
  {
    id: 'life_weaver', name: 'Life Weaver', category: 'Healing', art: '🌿',
    hp: 10, moveRange: 2, atkRange: 1, atkDmg: 2,
    description: 'Keeps allies standing longer than they should.',
    special: { name: 'Renew', description: 'Mends a nearby ally.', energyCost: 2, type: 'heal', amount: 6, range: 2, targetType: 'allyUnit' },
  },
  {
    id: 'thunder_mage', name: 'Thunder Mage', category: 'Attack', art: '⚡',
    hp: 8, moveRange: 2, atkRange: 4, atkDmg: 4,
    description: 'Long reach, but paper-thin defenses.',
    special: { name: 'Static Shock', description: 'Locks up a foe for a turn.', energyCost: 3, type: 'stun', amount: 0, duration: 1, range: 4, targetType: 'enemyUnit' },
  },
  {
    id: 'iron_wall', name: 'Iron Wall', category: 'Defense', art: '🛡️',
    hp: 26, moveRange: 1, atkRange: 1, atkDmg: 2,
    description: 'A moving barricade for the front line.',
    special: { name: 'Bulwark', description: 'Shares a heavy shield with an ally.', energyCost: 3, type: 'armor', amount: 10, range: 1, targetType: 'allyUnit' },
  },
  {
    id: 'venom_adept', name: 'Venom Adept', category: 'Debuff', art: '🐍',
    hp: 9, moveRange: 2, atkRange: 2, atkDmg: 3,
    description: 'Prefers a slow, poisoned death to a quick one.',
    special: { name: 'Toxin', description: 'Poisons a foe over time.', energyCost: 2, type: 'poison', amount: 3, duration: 2, range: 2, targetType: 'enemyUnit' },
  },
  {
    id: 'war_chief', name: 'War Chief', category: 'Buff', art: '🪓',
    hp: 12, moveRange: 2, atkRange: 1, atkDmg: 4,
    description: 'Rallies the troops before the charge.',
    special: { name: 'Rally', description: 'Boosts an ally\'s attack power.', energyCost: 3, type: 'buffAtk', amount: 3, duration: 2, range: 2, targetType: 'allyUnit' },
  },
  {
    id: 'siphon_wraith', name: 'Siphon Wraith', category: 'Utility', art: '👻',
    hp: 8, moveRange: 3, atkRange: 1, atkDmg: 3,
    description: 'Feeds on the energy of its enemies.',
    special: { name: 'Drain', description: 'Steals energy from the opponent.', energyCost: 2, type: 'energySteal', amount: 2, range: 1, targetType: 'enemyUnit' },
  },
  {
    id: 'battering_ram', name: 'Battering Ram', category: 'Attack', art: '🐏',
    hp: 14, moveRange: 3, atkRange: 1, atkDmg: 6,
    description: 'Built to smash through shields.',
    special: { name: 'Sunder', description: 'Shatters a foe\'s armor completely.', energyCost: 2, type: 'destroyArmor', amount: 0, range: 1, targetType: 'enemyUnit' },
  },
  {
    id: 'mirror_sprite', name: 'Mirror Sprite', category: 'Special', art: '🪞',
    hp: 7, moveRange: 2, atkRange: 1, atkDmg: 2,
    description: 'Splits itself when threatened.',
    special: { name: 'Duplicate', description: 'Creates a weaker copy of itself on an adjacent tile.', energyCost: 4, type: 'duplicate', amount: 0, range: 0, targetType: 'self' },
  },
  {
    id: 'storm_falcon', name: 'Storm Falcon', category: 'Attack', art: '🦅',
    hp: 8, moveRange: 5, atkRange: 1, atkDmg: 4,
    description: 'Nothing on the board outruns it.',
    special: { name: 'Skydive', description: 'A diving strike from above.', energyCost: 2, type: 'damage', amount: 6, range: 1, targetType: 'enemyUnit' },
  },
  {
    id: 'healing_totem', name: 'Healing Totem', category: 'Healing', art: '🌾',
    hp: 10, moveRange: 1, atkRange: 1, atkDmg: 1,
    description: 'Plants itself and mends the wounded.',
    special: { name: 'Sacred Ground', description: 'Heals an ally at range.', energyCost: 3, type: 'heal', amount: 5, range: 2, targetType: 'allyUnit' },
  },
  {
    id: 'bone_colossus', name: 'Bone Colossus', category: 'Defense', art: '💀',
    hp: 30, moveRange: 1, atkRange: 1, atkDmg: 5,
    description: 'A towering wall of ancient bone.',
    special: { name: 'Dread Roar', description: 'Terrifies a foe, slowing it badly.', energyCost: 3, type: 'slow', amount: 2, duration: 2, range: 2, targetType: 'enemyUnit' },
  },
  {
    id: 'arcane_sniper', name: 'Arcane Sniper', category: 'Attack', art: '🔮',
    hp: 7, moveRange: 2, atkRange: 5, atkDmg: 5,
    description: 'Sees the whole board and punishes it.',
    special: { name: 'Piercing Round', description: 'A devastating long-range shot.', energyCost: 3, type: 'damage', amount: 7, range: 5, targetType: 'enemyUnit' },
  },
  {
    id: 'trickster_fox', name: 'Trickster Fox', category: 'Utility', art: '🦊',
    hp: 8, moveRange: 4, atkRange: 1, atkDmg: 3,
    description: 'Slippery and hard to pin down.',
    special: { name: 'Smoke Bomb', description: 'Vanishes behind a defensive haze.', energyCost: 2, type: 'armor', amount: 4, range: 0, targetType: 'self' },
  },
  {
    id: 'void_priest', name: 'Void Priest', category: 'Debuff', art: '🌑',
    hp: 9, moveRange: 2, atkRange: 2, atkDmg: 3,
    description: 'Curses enemies with creeping decay.',
    special: { name: 'Curse', description: 'A heavy, long-lasting poison.', energyCost: 3, type: 'poison', amount: 4, duration: 3, range: 3, targetType: 'enemyUnit' },
  },
];

module.exports = { CARD_DEFS };
