export const PRIMARY_GOALS = ['Academic', 'Career', 'Fitness', 'Health', 'Personal Development', 'Productivity', 'Other']
export const FOCUS_AREAS = ['Study', 'Coding', 'DSA', 'Projects', 'Clinical Preparation', 'Revision', 'Fitness', 'Sleep', 'Nutrition', 'Reading', 'Finance', 'Productivity', 'Mental wellness', 'Career', 'Personal development']

const professionFocus = [
  { match: /computer|software|developer|programmer|coding/i, areas: ['Coding', 'DSA', 'Projects', 'Study', 'Productivity'] },
  { match: /medical|doctor|clinical|nurs/i, areas: ['Clinical Preparation', 'Revision', 'Study', 'Sleep', 'Nutrition', 'Mental wellness'] },
  { match: /mechanical|engineer/i, areas: ['Study', 'Projects', 'Productivity'] },
  { match: /political science|politics/i, areas: ['Reading', 'Study', 'Career'] },
]

// The one place where habit language is translated into dashboard sections.
// Keep this deterministic: it only classifies habits the user already owns.
const SECTION_RULES = [
  { id: 'dsa', title: 'DSA Practice', aliases: ['dsa', 'algorithms', 'data structures'] },
  { id: 'clinical', title: 'Clinical Preparation', aliases: ['clinical preparation', 'clinical', 'rotations'] },
  { id: 'revision', title: 'Revision', aliases: ['revision', 'review notes'] },
  { id: 'coding', title: 'Coding', aliases: ['coding', 'programming', 'software development', 'software engineering', 'development'] },
  { id: 'study', title: 'Study & Learning', aliases: ['study', 'education', 'learning', 'coursework', 'academic'] },
  { id: 'projects', title: 'Projects', aliases: ['projects', 'project work', 'project'] },
  { id: 'fitness', title: 'Fitness', aliases: ['fitness', 'exercise', 'workout', 'gym', 'training'] },
  { id: 'sleep', title: 'Sleep', aliases: ['sleep', 'rest'] },
  { id: 'nutrition', title: 'Nutrition', aliases: ['nutrition', 'diet', 'food', 'meal'] },
  { id: 'reading', title: 'Reading', aliases: ['reading', 'books', 'book'] },
  { id: 'finance', title: 'Finance', aliases: ['finance', 'money', 'budget', 'financial'] },
  { id: 'productivity', title: 'Productivity', aliases: ['productivity', 'planning', 'organization'] },
  { id: 'career', title: 'Career', aliases: ['career', 'professional'] },
  { id: 'health', title: 'Health', aliases: ['health', 'wellness', 'mental wellness'] },
  { id: 'personal-development', title: 'Personal Development', aliases: ['personal development', 'personal'] },
]

const focusToSection = new Map(SECTION_RULES.flatMap((rule) => rule.aliases.map((alias) => [alias, rule.id])))
const goalToFocus = { Academic: 'Study', Career: 'Career', Fitness: 'Fitness', Health: 'Health', Productivity: 'Productivity', 'Personal Development': 'Personal development' }

function sectionForText(value) {
  const normalized = String(value || '').trim().toLowerCase()
  const words = ` ${normalized.replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  return SECTION_RULES.find((rule) => rule.aliases.some((alias) => words.includes(` ${alias} `)))
}

export function sectionForHabit(habit) {
  const category = habit?.category?.trim()
  if (category && !['general', 'other'].includes(category.toLowerCase())) {
    return sectionForText(category) || { id: 'category:' + category.toLowerCase(), title: category }
  }
  return sectionForText(`${habit?.name || ''} ${habit?.description || ''}`)
}

export function normalizePersonalization(value = {}) {
  const goal = value.primaryGoal === 'Personal development' ? 'Personal Development' : value.primaryGoal
  return {
    primaryGoal: PRIMARY_GOALS.includes(goal) ? goal : null,
    profession: typeof value.profession === 'string' ? value.profession.trim().slice(0, 120) : '',
    areasOfFocus: [...new Set(Array.isArray(value.areasOfFocus) ? value.areasOfFocus.filter((area) => typeof area === 'string' && area.trim()).map((area) => area.trim().slice(0, 80)).slice(0, 30) : [])],
  }
}

export function dashboardConfig(personalization) {
  const profile = normalizePersonalization(personalization)
  const inferred = professionFocus.find(({ match }) => match.test(profile.profession))?.areas || []
  const goalFocus = profile.primaryGoal ? [goalToFocus[profile.primaryGoal]].filter(Boolean) : []
  const focusAreas = [...new Set([...profile.areasOfFocus, ...inferred, ...goalFocus])]
  const label = focusAreas.length ? `${focusAreas.slice(0, 3).join(' · ')} focus` : 'Today\'s habits'
  return { profile, focusAreas, habitsLabel: label, hasPersonalization: Boolean(profile.primaryGoal || profile.profession || focusAreas.length) }
}

export function sectionRank(habit, focusAreas) {
  const id = sectionForHabit(habit)?.id
  const index = focusAreas.findIndex((area) => (focusToSection.get(area.toLowerCase()) || 'category:' + area.toLowerCase()) === id)
  return index < 0 ? focusAreas.length : index
}

export function buildDashboardSections(habits, focusAreas) {
  const order = [...new Set(focusAreas.map((area) => focusToSection.get(area.toLowerCase()) || 'category:' + area.toLowerCase()))]
  const groups = new Map()
  for (const habit of habits) {
    const section = sectionForHabit(habit) || { id: 'other', title: 'Other Habits' }
    if (!groups.has(section.id)) groups.set(section.id, { ...section, habits: [] })
    groups.get(section.id).habits.push(habit)
  }
  const rank = (id) => order.includes(id) ? order.indexOf(id) : id === 'other' ? order.length + 1 : order.length
  const priority = { high: 0, medium: 1, low: 2 }
  for (const section of groups.values()) {
    section.habits.sort((a, b) => priority[a.priority] - priority[b.priority] || a.createdAt.localeCompare(b.createdAt))
  }
  return [...groups.values()].sort((a, b) => rank(a.id) - rank(b.id))
}
