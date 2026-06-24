"""
interpretations.py - Dynamic graha interpretation generator.
Generates contextual descriptions based on sign, house, and nakshatra.
"""

# Base meaning of each graha
GRAHA_BASE = {
    'Lagna':   'Ascendant / self-axis',
    'Sun':     'Soul, vitality, authority, father',
    'Moon':    'Mind, emotions, mother, nourishment',
    'Mars':    'Drive, courage, energy, conflicts',
    'Mercury': 'Intellect, speech, analysis, trade',
    'Jupiter': 'Wisdom, dharma, expansion, teachers',
    'Venus':   'Beauty, relationships, art, desires',
    'Saturn':  'Discipline, karma, structure, delay',
    'Rahu':    'Worldly desire, innovation, illusion',
    'Ketu':    'Spiritual release, detachment, past mastery',
}

# How each sign colors the graha
SIGN_FLAVOR = {
    'Aries':       'is energized, direct, and pioneering',
    'Taurus':      'seeks stability, beauty, and sensory refinement',
    'Gemini':      'becomes curious, communicative, and dualistic',
    'Cancer':      'turns deeply emotional, nurturing, and receptive',
    'Leo':         'shines with dignity, leadership, and creative pride',
    'Virgo':       'applies precision, analytical skill, and discernment',
    'Libra':       'seeks balance, beauty, and diplomatic relatedness',
    'Scorpio':     'operates through depth, transformation, and hidden power',
    'Sagittarius': 'expands toward wisdom, philosophy, and far horizons',
    'Capricorn':   'works through structure, duty, and long-term discipline',
    'Aquarius':    'innovates through networks, idealism, and collective vision',
    'Pisces':      'dissolves into intuition, spirituality, and boundlessness',
}

# Theme of each house
HOUSE_THEME = {
    1:  'self, body, identity, and first impressions',
    2:  'wealth, family, speech, and accumulated resources',
    3:  'courage, communication, siblings, and short journeys',
    4:  'home, mother, inner peace, and emotional roots',
    5:  'intelligence, creativity, romance, children, and speculation',
    6:  'service, health, enemies, debts, and competitive resolve',
    7:  'partnerships, marriage, public relations, and open conflicts',
    8:  'transformation, longevity, secrets, and shared resources',
    9:  'dharma, higher knowledge, teachers, father, and fortune',
    10: 'career, reputation, authority, and public standing',
    11: 'gains, networks, ambitions, and large groups',
    12: 'liberation, solitude, foreign lands, losses, and spiritual retreat',
}

# Nakshatra quality modifier
NAKSHATRA_FLAVOR = {
    'Aśvinī':           'with swift, healing, pioneering energy',
    'Bharaṇī':          'carrying intensity, transformation, and endurance',
    'Kṛttikā':          'with sharp, purifying, and assertive force',
    'Rohiṇī':           'in fertile, sensuous, and creative abundance',
    'Mṛgaśīrṣa':        'with curious, restless, and searching quality',
    'Ārdrā':            'through storms, intensity, and radical renewal',
    'Punarvasu':        'with returning light, optimism, and purification',
    'Puṣya':            'with protective nourishment and disciplined devotion',
    'Āśleṣā':           'through clinging, penetrating, and serpentine wisdom',
    'Maghā':            'in regal authority, ancestral honor, and power',
    'Pūrva Phalgunī':   'with pleasure, creativity, and solar warmth',
    'Uttara Phalgunī':  'through steady patronage, service, and maturity',
    'Hasta':            'with skillful hands, craft, precision, and cleverness',
    'Citrā':            'with brilliance, artistry, and architectural vision',
    'Svātī':            'in independence, movement, and dispersed flexibility',
    'Viśākhā':          'with burning ambition, branching focus, and dual purpose',
    'Anurādhā':         'through loyal devotion, perseverance, and friendship',
    'Jyeṣṭhā':          'in seniority, command, and subtle emotional authority',
    'Mūla':             'at the root, digging into hidden and karmic foundations',
    'Pūrva Āṣāḍhā':    'with bold declarations and invincible purifying energy',
    'Uttara Āṣāḍhā':   'through ultimate victory achieved with patience and ethics',
    'Śravaṇa':          'with careful listening, learning, and inner receptivity',
    'Dhaniṣṭhā':        'with musical rhythm, abundance, and martial precision',
    'Śatabhiṣaj':       'through healing, mystery, and vast oceanic depth',
    'Pūrva Bhādrapadā': 'with fierce, transformational, and spiritually intense fire',
    'Uttara Bhādrapadā':'in deep compassion, cosmic order, and serpentine steadiness',
    'Revatī':           'in gentle guidance, liminal spaces, and spiritual completion',
}


def _ordinal_suffix(n: int) -> str:
    if n in (1, 21): return 'st'
    if n in (2, 22): return 'nd'
    if n in (3, 23): return 'rd'
    return 'th'


def generate_interpretation(name: str, sign: str, house: int, nakshatra: str,
                             retrograde: bool = False) -> str:
    """Generate a dynamic interpretation string for a graha placement."""
    if name == 'Lagna':
        nak_desc = NAKSHATRA_FLAVOR.get(nakshatra, '')
        return (
            f"{sign} Lagna places life's center of gravity in {sign.lower()} themes: "
            f"{SIGN_FLAVOR.get(sign, '')}. The self is observed through "
            f"the {house}{_ordinal_suffix(house)}-house lens "
            f"({HOUSE_THEME.get(house, '')}) {nak_desc}."
        )

    base = GRAHA_BASE.get(name, name)
    sign_desc = SIGN_FLAVOR.get(sign, f'is placed in {sign}')
    house_desc = HOUSE_THEME.get(house, f'house {house}')
    nak_desc = NAKSHATRA_FLAVOR.get(nakshatra, '')
    retro_note = ' (retrograde — internalised, reflective quality)' if retrograde else ''

    return (
        f"{name} ({base}) {sign_desc} in the "
        f"{house}{_ordinal_suffix(house)} house ({house_desc})"
        f"{', ' + nak_desc if nak_desc else ''}{retro_note}."
    )


# Static fallback dict for backward compatibility
INTERPRETATIONS = {
    'Lagna':   'Scorpio Lagna gives the chart a deep, hidden, transformative center.',
    'Sun':     'Sun in Libra in the 12th house — vitality turned toward spiritual retreat.',
    'Moon':    'Moon in Cancer in the 9th house — mind connected to dharma and higher knowledge.',
    'Mars':    'Mars in Aries in the 6th house — direct, forceful energy against obstacles.',
    'Mercury': 'Mercury (Atmakaraka) in Libra H12 — analytical soul oriented toward solitude.',
    'Jupiter': 'Jupiter (Darakaraka) in Libra H12 — wisdom linked to foreign lands and retreat.',
    'Venus':   'Venus in Scorpio in the 1st house — magnetic, intense, privately artistic aura.',
    'Saturn':  'Saturn in Cancer with Moon H9 — discipline around dharma and long-term duty.',
    'Rahu':    'Rahu in Pisces H5 — amplified imagination, creativity, and unusual intelligence.',
    'Ketu':    'Ketu in Virgo H11 — detached from networks, granting analytical precision.',
}
