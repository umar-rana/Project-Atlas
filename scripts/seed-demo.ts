import { PrismaClient } from '@prisma/client'
import { uuidv7 } from 'uuidv7'

const prisma = new PrismaClient()

const DEMO_EMAIL = 'umar.rana@devsinc.com'

const now = new Date()
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

function daysFromToday(days: number, hour = 9, minute = 0): Date {
  const d = new Date(today)
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d
}

function daysAgo(days: number, hour = 9, minute = 0): Date {
  return daysFromToday(-days, hour, minute)
}

function textToTipTap(text: string) {
  const paragraphs = text.split('\n\n').filter((p) => p.trim())
  return {
    type: 'doc',
    content: paragraphs.map((p) => ({
      type: p.startsWith('## ') ? 'heading' : p.startsWith('# ') ? 'heading' : 'paragraph',
      attrs: p.startsWith('## ') ? { level: 2 } : p.startsWith('# ') ? { level: 1 } : undefined,
      content: [{ type: 'text', text: p.replace(/^#+ /, '') }],
    })),
  }
}

async function getTableColumns(table: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns WHERE table_name = ${table}
  `
  return new Set(rows.map((r) => r.column_name))
}

async function main() {
  console.log('🌱 Starting demo seed...')

  const user = await prisma.user.findFirst({
    where: { email: DEMO_EMAIL, deleted_at: null },
  })

  if (!user) {
    console.error(`❌ User ${DEMO_EMAIL} not found. Sign up first, then re-run this script.`)
    process.exit(1)
  }

  console.log(`✓ Found user: ${user.email} (id: ${user.id})`)

  // ── Pre-seed wipe ─────────────────────────────────────────────────────────
  // Remove all existing owned records for this user in FK-safe dependency order
  // so the seed produces a clean, predictable state.
  console.log('Wiping existing user data...')
  await prisma.$executeRaw`DELETE FROM "TagOnTask"    WHERE task_id    IN (SELECT id FROM "Task"    WHERE user_id = ${user.id}::uuid)`
  await prisma.$executeRaw`DELETE FROM "ContextOnTask" WHERE task_id   IN (SELECT id FROM "Task"    WHERE user_id = ${user.id}::uuid)`
  await prisma.$executeRaw`DELETE FROM "TaskWorkLog"  WHERE task_id    IN (SELECT id FROM "Task"    WHERE user_id = ${user.id}::uuid)`
  await prisma.$executeRaw`DELETE FROM "ChecklistItem" WHERE task_id   IN (SELECT id FROM "Task"    WHERE user_id = ${user.id}::uuid)`
  await prisma.$executeRaw`DELETE FROM "Task"          WHERE user_id   = ${user.id}::uuid`
  await prisma.$executeRaw`DELETE FROM "CaptureParseLog" WHERE user_id = ${user.id}::uuid`
  await prisma.$executeRaw`DELETE FROM "Capture"       WHERE user_id   = ${user.id}::uuid`
  await prisma.$executeRaw`DELETE FROM "Note"          WHERE user_id   = ${user.id}::uuid`
  await prisma.$executeRaw`DELETE FROM "NotesFolder"   WHERE user_id   = ${user.id}::uuid`
  await prisma.$executeRaw`DELETE FROM "Project"       WHERE user_id   = ${user.id}::uuid`
  await prisma.$executeRaw`DELETE FROM "ProjectFolder" WHERE user_id   = ${user.id}::uuid`
  await prisma.$executeRaw`DELETE FROM "Context"       WHERE user_id   = ${user.id}::uuid`
  await prisma.$executeRaw`DELETE FROM "Tag"           WHERE user_id   = ${user.id}::uuid`
  await prisma.$executeRaw`DELETE FROM "AuditLog"      WHERE user_id   = ${user.id}::uuid`
  await prisma.$executeRaw`DELETE FROM "AICallLog"     WHERE user_id   = ${user.id}::uuid`
  console.log('✓ Existing data wiped')

  // Detect which optional schema fields have been migrated to the live DB.
  // The script uses raw SQL for Task/Capture/Note to avoid Prisma applying
  // @default values for columns that haven't yet been applied to Neon.
  const taskCols = await getTableColumns('Task')
  const captureCols = await getTableColumns('Capture')
  const noteCols = await getTableColumns('Note')
  const hasTaskGtd = taskCols.has('is_someday')
  const hasCaptureGtd = captureCols.has('state')
  const hasNoteImport = noteCols.has('imported_from')
  if (!hasTaskGtd) console.log('  ⚠ Task GTD fields (is_someday, delegated_to_text, follow_up_date) not yet migrated — skipping')
  if (!hasCaptureGtd) console.log('  ⚠ Capture GTD fields (state, parser_proposal) not yet migrated — skipping')
  if (!hasNoteImport) console.log('  ⚠ Note import fields (imported_from, etc.) not in DB — no action needed for seed')

  // ── Contexts ──────────────────────────────────────────────────────────────
  // Use upsert: Context has a unique constraint on (user_id, name), so
  // re-running or seeding an existing user that already has these contexts
  // would fail with a unique constraint error on plain create.
  console.log('Creating contexts...')
  const contexts = await Promise.all(
    ['Calls', 'Email', 'Computer', 'Office', 'Errands', 'Home', 'Meetings', 'Reading', 'Waiting', 'Anywhere'].map(
      (name, i) =>
        prisma.context.upsert({
          where: { user_id_name: { user_id: user.id, name } },
          create: { id: uuidv7(), user_id: user.id, name, position: i },
          update: {},
        }),
    ),
  )
  const ctx = Object.fromEntries(contexts.map((c) => [c.name, c.id]))

  // ── Tags ──────────────────────────────────────────────────────────────────
  // Use upsert: Tag has a unique constraint on (user_id, name).
  console.log('Creating tags...')
  const tags = await Promise.all(
    ['urgent', 'review-needed', 'delegated', 'Q2', 'health', 'travel'].map((name) =>
      prisma.tag.upsert({
        where: { user_id_name: { user_id: user.id, name } },
        create: { id: uuidv7(), user_id: user.id, name },
        update: {},
      }),
    ),
  )
  const tag = Object.fromEntries(tags.map((t) => [t.name, t.id]))

  // ── Project folders ───────────────────────────────────────────────────────
  console.log('Creating project folders...')
  const workFolderId = uuidv7()
  const personalFolderId = uuidv7()
  await prisma.$executeRaw`
    INSERT INTO "ProjectFolder" (id, user_id, name, position, created_at, updated_at)
    VALUES (${workFolderId}::uuid, ${user.id}::uuid, 'Work', 1, ${now}, ${now})
  `
  await prisma.$executeRaw`
    INSERT INTO "ProjectFolder" (id, user_id, name, position, created_at, updated_at)
    VALUES (${personalFolderId}::uuid, ${user.id}::uuid, 'Personal', 2, ${now}, ${now})
  `
  const workFolder = { id: workFolderId }
  const personalFolder = { id: personalFolderId }

  // ── Projects ──────────────────────────────────────────────────────────────
  // Use raw SQL to avoid Prisma applying @default values for columns that
  // haven't yet been applied to the live DB (e.g. tracker_table_id).
  console.log('Creating projects...')

  async function createProject(opts: {
    title: string
    type: string
    status: string
    folder_id: string
    target_date: Date
    position: number
  }) {
    const id = uuidv7()
    await prisma.$executeRaw`
      INSERT INTO "Project" (id, user_id, title, type, status, folder_id, target_date, position, created_at, updated_at)
      VALUES (
        ${id}::uuid,
        ${user.id}::uuid,
        ${opts.title},
        ${opts.type},
        ${opts.status},
        ${opts.folder_id}::uuid,
        ${opts.target_date},
        ${opts.position},
        ${now},
        ${now}
      )
    `
    return { id }
  }

  const projQ2 = await createProject({
    title: 'Q2 Strategic Planning',
    type: 'project',
    status: 'active',
    folder_id: workFolder.id,
    target_date: daysFromToday(45),
    position: 1,
  })

  const projAtlas = await createProject({
    title: 'Atlas product launch',
    type: 'project',
    status: 'active',
    folder_id: workFolder.id,
    target_date: daysFromToday(90),
    position: 2,
  })

  const projDevsinc = await createProject({
    title: 'Devsinc partnership initiative',
    type: 'project',
    status: 'active',
    folder_id: workFolder.id,
    target_date: daysFromToday(60),
    position: 3,
  })

  const projMarathon = await createProject({
    title: 'Half marathon training',
    type: 'area',
    status: 'active',
    folder_id: personalFolder.id,
    target_date: daysFromToday(120),
    position: 1,
  })

  const projRenovation = await createProject({
    title: 'Guest room renovation',
    type: 'project',
    status: 'active',
    folder_id: personalFolder.id,
    target_date: daysFromToday(30),
    position: 2,
  })

  // ── Tasks ─────────────────────────────────────────────────────────────────
  console.log('Creating tasks...')

  async function createTask(opts: {
    title: string
    project_id?: string
    context_id?: string
    due_date?: Date
    defer_date?: Date
    completed_at?: Date
    flagged?: boolean
    estimated_minutes?: number
    notes?: string
    tags?: string[]
    is_someday?: boolean
    delegated_to_text?: string
    follow_up_date?: Date
    daysOldCreated?: number
  }) {
    const created_at = opts.daysOldCreated
      ? daysAgo(opts.daysOldCreated)
      : daysAgo(Math.floor(Math.random() * 14) + 1)

    const taskId = uuidv7()

    // Use raw SQL to avoid Prisma applying @default values client-side for
    // columns that may not yet exist in the live DB. GTD fields are included
    // conditionally based on what was detected at startup.
    if (hasTaskGtd) {
      await prisma.$executeRaw`
        INSERT INTO "Task" (
          id, user_id, project_id, title, notes, flagged,
          defer_date, due_date, completed_at, estimated_minutes,
          is_someday, delegated_to_text, follow_up_date,
          status, created_at, updated_at
        ) VALUES (
          ${taskId}::uuid,
          ${user.id}::uuid,
          ${opts.project_id ?? null}::uuid,
          ${opts.title},
          ${opts.notes ?? null},
          ${opts.flagged ?? false},
          ${opts.defer_date ?? null},
          ${opts.due_date ?? null},
          ${opts.completed_at ?? null},
          ${opts.estimated_minutes ?? null},
          ${opts.is_someday ?? false},
          ${opts.delegated_to_text ?? null},
          ${opts.follow_up_date ?? null},
          'active',
          ${created_at},
          ${created_at}
        )
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO "Task" (
          id, user_id, project_id, title, notes, flagged,
          defer_date, due_date, completed_at, estimated_minutes,
          status, created_at, updated_at
        ) VALUES (
          ${taskId}::uuid,
          ${user.id}::uuid,
          ${opts.project_id ?? null}::uuid,
          ${opts.title},
          ${opts.notes ?? null},
          ${opts.flagged ?? false},
          ${opts.defer_date ?? null},
          ${opts.due_date ?? null},
          ${opts.completed_at ?? null},
          ${opts.estimated_minutes ?? null},
          'active',
          ${created_at},
          ${created_at}
        )
      `
    }

    const task = { id: taskId }

    if (opts.context_id) {
      await prisma.contextOnTask.create({
        data: { task_id: task.id, context_id: opts.context_id },
      })
    }

    if (opts.tags) {
      for (const tagName of opts.tags) {
        if (tag[tagName]) {
          await prisma.tagOnTask.create({
            data: { task_id: task.id, tag_id: tag[tagName] },
          })
        }
      }
    }

    return task
  }

  // Q2 Strategic Planning tasks (9)
  await createTask({ title: 'Draft Q2 OKRs document', project_id: projQ2.id, context_id: ctx.Computer, completed_at: daysAgo(5), estimated_minutes: 90, tags: ['Q2'], daysOldCreated: 12 })
  await createTask({ title: 'Schedule Q2 leadership offsite', project_id: projQ2.id, context_id: ctx.Email, due_date: daysFromToday(0, 14, 0), flagged: true, estimated_minutes: 30, tags: ['Q2', 'urgent'] })
  await createTask({ title: 'Review department budget allocations', project_id: projQ2.id, context_id: ctx.Computer, due_date: daysFromToday(2), estimated_minutes: 120, tags: ['Q2', 'review-needed'] })
  await createTask({ title: 'Finalize hiring plan for Q2', project_id: projQ2.id, context_id: ctx.Meetings, due_date: daysFromToday(5), estimated_minutes: 60, tags: ['Q2'] })
  await createTask({ title: 'Present Q2 strategy to executive team', project_id: projQ2.id, context_id: ctx.Meetings, due_date: daysFromToday(10, 11, 0), estimated_minutes: 90, flagged: true, tags: ['Q2'] })
  await createTask({ title: 'Align with finance on Q2 forecast', project_id: projQ2.id, context_id: ctx.Calls, due_date: daysFromToday(3, 15, 0), estimated_minutes: 45, tags: ['Q2'] })
  await createTask({ title: 'Update strategic priorities document', project_id: projQ2.id, context_id: ctx.Computer, due_date: daysFromToday(7), estimated_minutes: 60, tags: ['Q2', 'review-needed'] })
  await createTask({ title: 'Send Q2 kickoff communication to teams', project_id: projQ2.id, context_id: ctx.Email, due_date: daysFromToday(12), estimated_minutes: 30, tags: ['Q2'] })
  await createTask({ title: 'Schedule Q2 mid-quarter check-in', project_id: projQ2.id, context_id: ctx.Email, defer_date: daysFromToday(30), estimated_minutes: 15, tags: ['Q2'] })

  // Atlas product launch tasks (8)
  await createTask({ title: 'Define MVP feature scope', project_id: projAtlas.id, context_id: ctx.Computer, completed_at: daysAgo(8), estimated_minutes: 120, daysOldCreated: 18 })
  await createTask({ title: 'Choose technology stack', project_id: projAtlas.id, context_id: ctx.Computer, completed_at: daysAgo(3), estimated_minutes: 90, daysOldCreated: 14 })
  await createTask({ title: 'Design wireframes for core flows', project_id: projAtlas.id, context_id: ctx.Computer, due_date: daysFromToday(0, 16, 0), estimated_minutes: 180, flagged: true })
  await createTask({ title: 'Schedule investor pitch prep session', project_id: projAtlas.id, context_id: ctx.Email, due_date: daysFromToday(1), estimated_minutes: 30, tags: ['urgent'] })
  await createTask({ title: 'Refine product positioning', project_id: projAtlas.id, context_id: ctx.Computer, due_date: daysFromToday(4), estimated_minutes: 90, tags: ['review-needed'] })
  await createTask({ title: 'Build investor pitch deck', project_id: projAtlas.id, context_id: ctx.Computer, due_date: daysFromToday(8), estimated_minutes: 240, flagged: true })
  await createTask({ title: 'Identify beta user candidates', project_id: projAtlas.id, context_id: ctx.Computer, due_date: daysFromToday(15), estimated_minutes: 60 })
  await createTask({ title: 'Plan launch announcement strategy', project_id: projAtlas.id, context_id: ctx.Computer, defer_date: daysFromToday(45), estimated_minutes: 120 })

  // Devsinc partnership tasks (6)
  await createTask({ title: 'Initial partnership exploration call', project_id: projDevsinc.id, context_id: ctx.Calls, completed_at: daysAgo(10), estimated_minutes: 60, daysOldCreated: 15 })
  await createTask({ title: 'Send partnership proposal draft', project_id: projDevsinc.id, context_id: ctx.Email, due_date: daysFromToday(1, 10, 0), estimated_minutes: 30, tags: ['urgent'] })
  await createTask({ title: 'Review legal terms with team', project_id: projDevsinc.id, context_id: ctx.Meetings, due_date: daysFromToday(6), estimated_minutes: 90, tags: ['review-needed'] })
  await createTask({ title: 'Awaiting feedback on partnership terms', project_id: projDevsinc.id, context_id: ctx.Waiting, delegated_to_text: 'Sarah (Partnership Lead)', follow_up_date: daysFromToday(3), tags: ['delegated'], daysOldCreated: 5 })
  await createTask({ title: 'Schedule signing ceremony', project_id: projDevsinc.id, context_id: ctx.Email, defer_date: daysFromToday(20), estimated_minutes: 30 })
  await createTask({ title: 'Plan joint go-to-market rollout', project_id: projDevsinc.id, context_id: ctx.Meetings, defer_date: daysFromToday(40), estimated_minutes: 120 })

  // Half marathon training tasks (8)
  await createTask({ title: 'Long run — 12km', project_id: projMarathon.id, context_id: ctx.Anywhere, completed_at: daysAgo(2, 7, 30), estimated_minutes: 75, tags: ['health'] })
  await createTask({ title: 'Buy new running shoes', project_id: projMarathon.id, context_id: ctx.Errands, completed_at: daysAgo(7), estimated_minutes: 60, tags: ['health'] })
  await createTask({ title: 'Tempo run — 6km', project_id: projMarathon.id, context_id: ctx.Anywhere, due_date: daysFromToday(0, 7, 0), estimated_minutes: 45, tags: ['health'] })
  await createTask({ title: 'Easy run — 5km', project_id: projMarathon.id, context_id: ctx.Anywhere, due_date: daysFromToday(2, 7, 0), estimated_minutes: 30, tags: ['health'] })
  await createTask({ title: 'Long run — 14km', project_id: projMarathon.id, context_id: ctx.Anywhere, due_date: daysFromToday(5, 7, 0), estimated_minutes: 90, tags: ['health'] })
  await createTask({ title: 'Schedule sports massage', project_id: projMarathon.id, context_id: ctx.Calls, due_date: daysFromToday(3), estimated_minutes: 15, tags: ['health'] })
  await createTask({ title: 'Research race day logistics', project_id: projMarathon.id, context_id: ctx.Computer, defer_date: daysFromToday(60), estimated_minutes: 45, tags: ['health'] })
  await createTask({ title: 'Book post-race recovery time', project_id: projMarathon.id, context_id: ctx.Email, defer_date: daysFromToday(100), estimated_minutes: 15 })

  // Home renovation tasks (7)
  await createTask({ title: 'Get vendor quotes for painting', project_id: projRenovation.id, context_id: ctx.Calls, completed_at: daysAgo(15), estimated_minutes: 60, daysOldCreated: 25 })
  await createTask({ title: 'Choose paint colors', project_id: projRenovation.id, context_id: ctx.Errands, completed_at: daysAgo(8), estimated_minutes: 90 })
  await createTask({ title: 'Order new bed frame', project_id: projRenovation.id, context_id: ctx.Computer, completed_at: daysAgo(4), estimated_minutes: 30 })
  await createTask({ title: 'Buy bedside lamps', project_id: projRenovation.id, context_id: ctx.Errands, completed_at: daysAgo(1), estimated_minutes: 45 })
  await createTask({ title: 'Coordinate painter scheduling', project_id: projRenovation.id, context_id: ctx.Calls, due_date: daysFromToday(0, 17, 0), estimated_minutes: 20, flagged: true })
  await createTask({ title: 'Awaiting curtain delivery', project_id: projRenovation.id, context_id: ctx.Waiting, delegated_to_text: 'Home Décor Store', follow_up_date: daysFromToday(5), tags: ['delegated'], daysOldCreated: 7 })
  await createTask({ title: 'Plan room arrangement and decoration', project_id: projRenovation.id, context_id: ctx.Home, due_date: daysFromToday(8), estimated_minutes: 60 })

  // Standalone tasks (6)
  await createTask({ title: "Mom's birthday — call and arrange flowers", context_id: ctx.Calls, due_date: daysFromToday(6, 18, 0), flagged: true, estimated_minutes: 30 })
  await createTask({ title: 'Renew driving license', context_id: ctx.Errands, due_date: daysFromToday(14), estimated_minutes: 90 })
  await createTask({ title: 'Review investment portfolio quarterly', context_id: ctx.Computer, defer_date: daysFromToday(20), estimated_minutes: 60 })
  await createTask({ title: 'Plan family weekend trip', context_id: ctx.Computer, defer_date: daysFromToday(15), estimated_minutes: 45, tags: ['travel'] })
  await createTask({ title: 'Prepare monthly expense report', context_id: ctx.Computer, due_date: daysFromToday(4), estimated_minutes: 45, tags: ['review-needed'] })
  await createTask({ title: 'Call insurance company about renewal', context_id: ctx.Calls, due_date: daysFromToday(9), estimated_minutes: 30 })

  // Someday/Maybe tasks (3)
  await createTask({ title: 'Learn Arabic basics', is_someday: true, daysOldCreated: 30 })
  await createTask({ title: 'Visit Hunza valley', is_someday: true, tags: ['travel'], daysOldCreated: 45 })
  await createTask({ title: 'Write a book on leadership', is_someday: true, daysOldCreated: 60 })

  // Waiting-for tasks (3)
  await createTask({ title: 'Awaiting Q2 budget approval', context_id: ctx.Waiting, delegated_to_text: 'Finance team', follow_up_date: daysFromToday(2), tags: ['delegated', 'Q2'], daysOldCreated: 4 })
  await createTask({ title: 'Awaiting design feedback', context_id: ctx.Waiting, delegated_to_text: 'Ahmed (Designer)', follow_up_date: daysAgo(1), tags: ['delegated'], daysOldCreated: 8 })
  await createTask({ title: 'Awaiting vendor pricing', context_id: ctx.Waiting, delegated_to_text: 'IT vendor', follow_up_date: daysFromToday(7), tags: ['delegated'], daysOldCreated: 3 })

  console.log('✓ Created 50 tasks')

  // ── Captures ──────────────────────────────────────────────────────────────
  console.log('Creating captures...')
  const captureContents = [
    { raw: 'Call dentist about cleaning appointment', proposal: { proposed_disposition: 'task', proposed_attributes: { context_id: ctx.Calls } }, hoursAgo: 2 },
    { raw: 'Idea: weekly team lunch tradition could improve morale', proposal: { proposed_disposition: 'note' }, hoursAgo: 5 },
    { raw: 'Buy birthday gift for Hassan', proposal: { proposed_disposition: 'task', proposed_attributes: { context_id: ctx.Errands } }, hoursAgo: 18 },
    { raw: 'Article worth reading: "The discipline of decision making"', proposal: { proposed_disposition: 'note', proposed_attributes: { purpose: 'reading_note' } }, hoursAgo: 24 },
    { raw: 'Schedule annual health check-up', proposal: { proposed_disposition: 'task', proposed_attributes: { tags: ['health'] } }, hoursAgo: 36 },
    { raw: 'Follow up with Khalid on the proposal', proposal: { proposed_disposition: 'task', proposed_attributes: { context_id: ctx.Email } }, hoursAgo: 48 },
    { raw: 'Remember: the bookshop on Mall Road has good leadership section', proposal: { proposed_disposition: 'note' }, hoursAgo: 72 },
    { raw: 'Update LinkedIn profile with recent role changes', proposal: { proposed_disposition: 'task', proposed_attributes: { context_id: ctx.Computer } }, hoursAgo: 96 },
  ]

  for (const c of captureContents) {
    const created_at = new Date(now.getTime() - c.hoursAgo * 60 * 60 * 1000)
    const captureId = uuidv7()
    const proposalJson = JSON.stringify(c.proposal)
    // Use raw SQL to avoid Prisma applying @default values client-side for
    // columns that may not yet exist in the live DB. GTD fields are included
    // conditionally based on what was detected at startup.
    if (hasCaptureGtd) {
      await prisma.$executeRaw`
        INSERT INTO "Capture" (id, user_id, raw_text, tags, action_items, ai_parsed, state, parser_proposal, created_at, updated_at)
        VALUES (${captureId}::uuid, ${user.id}::uuid, ${c.raw}, '{}', '{}', false, 'proposed', ${proposalJson}::jsonb, ${created_at}, ${created_at})
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO "Capture" (id, user_id, raw_text, tags, action_items, ai_parsed, created_at, updated_at)
        VALUES (${captureId}::uuid, ${user.id}::uuid, ${c.raw}, '{}', '{}', false, ${created_at}, ${created_at})
      `
    }
  }
  console.log('✓ Created 8 captures')

  // ── Notes folders ─────────────────────────────────────────────────────────
  console.log('Creating notes folders...')
  const notesWork = await prisma.notesFolder.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Work', position: 1 },
  })
  const notesPersonal = await prisma.notesFolder.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Personal', position: 2 },
  })
  const notesArchive = await prisma.notesFolder.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Archive', position: 3 },
  })
  const notesQ2 = await prisma.notesFolder.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Q2 Planning', parent_id: notesWork.id, position: 1 },
  })
  const notesAtlas = await prisma.notesFolder.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Atlas', parent_id: notesWork.id, position: 2 },
  })
  const notesDevsinc = await prisma.notesFolder.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Devsinc', parent_id: notesWork.id, position: 3 },
  })
  const notesHealth = await prisma.notesFolder.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Health', parent_id: notesPersonal.id, position: 1 },
  })
  const notesReading = await prisma.notesFolder.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Reading', parent_id: notesPersonal.id, position: 2 },
  })
  const notesHome = await prisma.notesFolder.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Home', parent_id: notesPersonal.id, position: 3 },
  })

  // ── Notes ─────────────────────────────────────────────────────────────────
  console.log('Creating notes...')

  // Use raw SQL to avoid Prisma applying schema defaults for columns that
  // haven't been migrated to the live DB yet (imported_from, imported_at, source_metadata).
  async function createNote(opts: {
    title: string
    bodyText: string
    purpose: string
    folder_id?: string
    project_id?: string
    is_project_brief?: boolean
    created_at?: Date
    updated_at?: Date
  }) {
    const id = uuidv7()
    const body_json = JSON.stringify(textToTipTap(opts.bodyText))
    const created_at = opts.created_at ?? now
    const updated_at = opts.updated_at ?? created_at
    await prisma.$executeRaw`
      INSERT INTO "Note" (
        id, user_id, folder_id, project_id, title, body_json,
        is_project_brief, purpose, created_at, updated_at
      ) VALUES (
        ${id}::uuid,
        ${user.id}::uuid,
        ${opts.folder_id ?? null}::uuid,
        ${opts.project_id ?? null}::uuid,
        ${opts.title},
        ${body_json},
        ${opts.is_project_brief ?? false},
        ${opts.purpose},
        ${created_at},
        ${updated_at}
      )
    `
    return { id }
  }

  await createNote({
    title: 'Q2 Strategy Brief',
    bodyText: `Q2 represents an inflection point. We need to balance the immediate revenue targets with the longer-term platform investments that compound.

## Three pillars

1. Hiring acceleration in engineering and product
2. Strategic partnership with Devsinc to expand reach
3. Atlas product launch as our flagship initiative

## Risks

Budget pressure may force us to choose between hiring and platform spend. Need clarity from finance early in the quarter.

## Success metrics

Revenue, hiring rate, partnership signed, Atlas in beta with 10 users.`,
    purpose: 'project_brief',
    folder_id: notesQ2.id,
    project_id: projQ2.id,
    is_project_brief: true,
    created_at: daysAgo(20),
    updated_at: daysAgo(2),
  })

  await createNote({
    title: 'Leadership offsite notes',
    bodyText: `# Leadership offsite — March 2026

## Attendees
CEO, COO, CFO, VP Eng, VP Product

## Key decisions
- Q2 OKRs locked at end of week
- Hiring plan adjusted to 12 senior engineers
- Atlas launch moved up by two weeks

## Action items
- Draft revised hiring plan (me)
- Get finance sign-off on Atlas budget (CFO)
- Communicate to teams by Friday`,
    purpose: 'meeting_note',
    folder_id: notesQ2.id,
    created_at: daysAgo(15),
  })

  await createNote({
    title: 'Q2 OKRs draft',
    bodyText: `# Q2 Objectives

## Objective 1: Accelerate engineering capacity
- Hire 12 senior engineers
- Reduce time-to-productivity for new hires by 30%

## Objective 2: Launch Atlas v1
- Ship MVP to 10 beta users
- Achieve 70% weekly active rate
- Collect structured feedback on top 3 friction points

## Objective 3: Devsinc partnership signed
- Terms agreed by mid-quarter
- First joint customer engagement by quarter-end`,
    purpose: 'note',
    folder_id: notesQ2.id,
    created_at: daysAgo(12),
    updated_at: daysAgo(4),
  })

  await createNote({
    title: 'Atlas product vision',
    bodyText: `# Atlas — personal command center

A productivity system that combines GTD discipline with modern intelligence. Captures everything quickly, helps you process deliberately, and grows with you.

## Why now

Existing tools force a choice: either rigid task managers (OmniFocus) or freeform notebooks (Notion, Obsidian). Neither integrates the two well.

## Differentiation
- Capture is sacred — never blocks
- Processing is deliberate — every item gets a real decision
- The system grows with the user, not against them

## Reference

See [[Investor pitch outline]] for the pitch narrative.`,
    purpose: 'project_brief',
    folder_id: notesAtlas.id,
    project_id: projAtlas.id,
    is_project_brief: true,
    created_at: daysAgo(25),
    updated_at: daysAgo(3),
  })

  await createNote({
    title: 'Investor pitch outline',
    bodyText: `# Investor pitch outline

## Opening (2 minutes)
The problem: knowledge workers lose 2 hours daily to context-switching and lost ideas.

## The product (5 minutes)
Atlas demo — capture flow, processing mode, perspectives.

## The market (3 minutes)
TAM: 80M knowledge workers globally. Premium productivity tools market: $4B.

## Why us (2 minutes)
Domain expertise + technical execution + design taste.

## The ask (1 minute)
$2M seed to ship to 1000 paying users in 12 months.`,
    purpose: 'note',
    folder_id: notesAtlas.id,
    created_at: daysAgo(10),
    updated_at: daysAgo(1),
  })

  await createNote({
    title: 'Partnership terms discussion',
    bodyText: `# Partnership terms — first draft

## Met with
Sarah (Partnership Lead, Devsinc)

## Key terms agreed
- Revenue share: 70/30
- Joint marketing commitment for Q2-Q3
- Shared technical resources for integration work

## Open questions
- Exclusivity window: 6 or 12 months?
- IP ownership for jointly-developed components
- Termination clauses

## Next steps
Send draft proposal by next week.`,
    purpose: 'meeting_note',
    folder_id: notesDevsinc.id,
    created_at: daysAgo(8),
  })

  await createNote({
    title: 'Vendor evaluation criteria',
    bodyText: `## Evaluation criteria for technology partners

1. Technical capability — proven delivery track record
2. Cultural fit — values alignment with our team
3. Reference customers — three reachable references
4. Pricing transparency — clear terms, no surprises
5. Long-term viability — will they exist in 5 years?`,
    purpose: 'note',
    folder_id: notesDevsinc.id,
    created_at: daysAgo(14),
  })

  await createNote({
    title: 'Half marathon training plan',
    bodyText: `# Half marathon training — 16 weeks

## Goal
Complete the October half marathon under 2:15.

## Approach
Progressive base building, tempo work, weekly long run.

## Weekly structure
- Monday: rest
- Tuesday: tempo run (5-8km)
- Wednesday: easy run (5km)
- Thursday: cross-training
- Friday: rest
- Saturday: long run (progressive 10-21km)
- Sunday: easy run (5km)

## Costs
See [[Cash Register]] for gear and race-related expenses.

## Nutrition
See [[Nutrition principles]] for the strategy.`,
    purpose: 'project_brief',
    folder_id: notesHealth.id,
    project_id: projMarathon.id,
    is_project_brief: true,
    created_at: daysAgo(35),
    updated_at: daysAgo(7),
  })

  await createNote({
    title: 'Nutrition principles',
    bodyText: `# Nutrition for endurance training

From "Run with Power" and similar sources.

## Daily basics
- Protein: 1.6g per kg bodyweight
- Carbs: 5-7g per kg on training days
- Hydration: 3L baseline + replacement during runs

## Pre-run (90 min before)
Easy carbs, modest protein, low fat. Banana with peanut butter works well.

## During long runs (>90 min)
Gels every 30 minutes. Sip water continuously.

## Post-run recovery
Within 30 min: 20g protein + 40g carbs.`,
    purpose: 'reading_note',
    folder_id: notesHealth.id,
    created_at: daysAgo(28),
  })

  await createNote({
    title: 'Atomic Habits — key takeaways',
    bodyText: `# Atomic Habits — James Clear

## Core insight
Habits compound. Small improvements (1%) sustained daily yield massive results over years.

## The four laws
1. Make it obvious (cue)
2. Make it attractive (craving)
3. Make it easy (response)
4. Make it satisfying (reward)

## Identity-based habits
"I am someone who runs" beats "I want to run more."

## Implementation
- Start ridiculously small
- Stack new habits onto existing routines
- Track to make progress visible
- Never miss twice in a row`,
    purpose: 'reading_note',
    folder_id: notesReading.id,
    created_at: daysAgo(45),
    updated_at: daysAgo(40),
  })

  await createNote({
    title: 'The Hard Thing About Hard Things — notes',
    bodyText: `# The Hard Thing About Hard Things — Ben Horowitz

## Big lesson
Building a company means making decisions in fog. There are no easy answers when things are hard.

## On layoffs
Be direct. Be brief. Train managers to deliver the news. Have severance ready. Ship same-day.

## On firing executives
"Hired for what they could do, fired for what they couldn't."

## On wartime vs peacetime CEO
Peacetime: optimize. Wartime: survive.

## On feedback
Public praise. Private criticism. The shit sandwich is condescending.`,
    purpose: 'reading_note',
    folder_id: notesReading.id,
    created_at: daysAgo(50),
  })

  await createNote({
    title: 'Guest room renovation plan',
    bodyText: `# Guest room renovation

## Timeline
4 weeks total. Currently week 2.

## Budget
PKR 250,000 total. Currently PKR 145,000 spent.

## Scope
- Repaint walls (warm cream)
- Replace bed frame and bedside lamps
- New curtains
- Reorganize closet space

## Vendors
See [[Vendor contacts]] for painter, decorator, and curtain shop details.`,
    purpose: 'project_brief',
    folder_id: notesHome.id,
    project_id: projRenovation.id,
    is_project_brief: true,
    created_at: daysAgo(22),
    updated_at: daysAgo(5),
  })

  await createNote({
    title: 'Vendor contacts',
    bodyText: `# Trusted vendor contacts

## Painter
Imran Decor Services — 0300-1234567
Reliable, clean work. Used for 3 rooms previously.

## Curtain shop
Mall Road Furnishings — 042-37501234
Good selection, reasonable prices, two-week delivery.

## Furniture
Master's Furniture — DHA showroom
Custom orders take 4-6 weeks.

## Electrician
Naveed — 0321-9876543
Available short notice, charges fairly.`,
    purpose: 'note',
    folder_id: notesHome.id,
    created_at: daysAgo(18),
  })

  await createNote({
    title: 'Old project retrospective',
    bodyText: `# Q4 2025 retrospective

## What worked
- Daily standups kept the team aligned
- Customer interviews informed roadmap
- Shipping in 2-week increments

## What didn't
- Underestimated the scope of migration work
- Waited too long to bring in additional engineers
- Missed two stakeholder check-ins

## Key learnings
- Estimate ambitiously then add 50%
- Hire ahead of need, not after pain
- Stakeholder communication is the work, not overhead`,
    purpose: 'note',
    folder_id: notesArchive.id,
    created_at: daysAgo(90),
    updated_at: daysAgo(85),
  })

  console.log('✓ Created 14 notes')

  // ── Tables folders ────────────────────────────────────────────────────────
  console.log('Creating tables folders...')
  const tablesPersonal = await prisma.tablesFolder.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Personal', position: 1 },
  })
  const tablesWork = await prisma.tablesFolder.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Work', position: 2 },
  })

  // ── Tables ────────────────────────────────────────────────────────────────
  console.log('Creating tables...')

  // Cash Register
  const tableCash = await prisma.table.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Cash Register', description: 'Personal expense tracking', folder_id: tablesPersonal.id, created_at: daysAgo(40) },
  })

  const cashCols = await Promise.all([
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableCash.id, name: 'Date', type: 'date', position: 1, config: {}, aggregation: 'count' } }),
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableCash.id, name: 'Vendor', type: 'text', position: 2, config: {} } }),
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableCash.id, name: 'Amount', type: 'currency', position: 3, config: { decimal_places: 2 }, aggregation: 'sum' } }),
    prisma.tableColumn.create({
      data: {
        id: uuidv7(),
        table_id: tableCash.id,
        name: 'Category',
        type: 'single_select',
        position: 4,
        config: {
          options: [
            { id: 'opt_001', label: 'Food', color: 'blue' },
            { id: 'opt_002', label: 'Transport', color: 'green' },
            { id: 'opt_003', label: 'Utilities', color: 'yellow' },
            { id: 'opt_004', label: 'Health', color: 'red' },
            { id: 'opt_005', label: 'Misc', color: 'gray' },
          ],
        },
      },
    }),
  ])

  const cashRows = [
    { daysAgo: 1, vendor: 'Daraz', amount: 2450.0, cat: 'opt_005' },
    { daysAgo: 2, vendor: 'Petrol pump', amount: 5000.0, cat: 'opt_002' },
    { daysAgo: 3, vendor: 'K-Electric', amount: 12300.0, cat: 'opt_003' },
    { daysAgo: 5, vendor: 'Carrefour', amount: 8750.0, cat: 'opt_001' },
    { daysAgo: 6, vendor: 'Sports shop', amount: 15000.0, cat: 'opt_004' },
    { daysAgo: 8, vendor: 'Restaurant', amount: 4200.0, cat: 'opt_001' },
    { daysAgo: 10, vendor: 'SNGPL', amount: 3500.0, cat: 'opt_003' },
    { daysAgo: 12, vendor: 'Gym membership', amount: 8000.0, cat: 'opt_004' },
    { daysAgo: 14, vendor: 'Bookshop', amount: 2200.0, cat: 'opt_005' },
    { daysAgo: 17, vendor: 'Petrol pump', amount: 5000.0, cat: 'opt_002' },
  ]

  for (const r of cashRows) {
    const row = await prisma.tableRow.create({ data: { id: uuidv7(), table_id: tableCash.id, created_at: daysAgo(r.daysAgo) } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: cashCols[0].id, value: { date: daysAgo(r.daysAgo).toISOString().split('T')[0] } } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: cashCols[1].id, value: { text: r.vendor } } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: cashCols[2].id, value: { number: r.amount } } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: cashCols[3].id, value: { option_id: r.cat } } })
  }

  // Books to read
  const tableBooks = await prisma.table.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Books to read', folder_id: tablesPersonal.id, created_at: daysAgo(30) },
  })

  const bookCols = await Promise.all([
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableBooks.id, name: 'Title', type: 'text', position: 1, config: {} } }),
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableBooks.id, name: 'Author', type: 'text', position: 2, config: {} } }),
    prisma.tableColumn.create({
      data: {
        id: uuidv7(),
        table_id: tableBooks.id,
        name: 'Status',
        type: 'single_select',
        position: 3,
        config: {
          options: [
            { id: 'opt_001', label: 'To read', color: 'gray' },
            { id: 'opt_002', label: 'Reading', color: 'blue' },
            { id: 'opt_003', label: 'Finished', color: 'green' },
          ],
        },
      },
    }),
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableBooks.id, name: 'Started', type: 'date', position: 4, config: {} } }),
  ])

  const books = [
    { title: 'Atomic Habits', author: 'James Clear', status: 'opt_003', startedDays: 50 },
    { title: 'The Hard Thing About Hard Things', author: 'Ben Horowitz', status: 'opt_003', startedDays: 60 },
    { title: 'Thinking in Systems', author: 'Donella Meadows', status: 'opt_002', startedDays: 10 },
    { title: 'High Output Management', author: 'Andrew Grove', status: 'opt_001', startedDays: null },
    { title: 'Working Backwards', author: 'Colin Bryar', status: 'opt_001', startedDays: null },
  ]

  for (const b of books) {
    const row = await prisma.tableRow.create({ data: { id: uuidv7(), table_id: tableBooks.id } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: bookCols[0].id, value: { text: b.title } } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: bookCols[1].id, value: { text: b.author } } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: bookCols[2].id, value: { option_id: b.status } } })
    if (b.startedDays !== null) {
      await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: bookCols[3].id, value: { date: daysAgo(b.startedDays).toISOString().split('T')[0] } } })
    }
  }

  // Subscriptions
  const tableSubs = await prisma.table.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Subscriptions', folder_id: tablesPersonal.id, created_at: daysAgo(60) },
  })

  const subCols = await Promise.all([
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableSubs.id, name: 'Service', type: 'text', position: 1, config: {} } }),
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableSubs.id, name: 'Cost', type: 'currency', position: 2, config: { decimal_places: 2 }, aggregation: 'sum' } }),
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableSubs.id, name: 'Renewal', type: 'date', position: 3, config: {} } }),
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableSubs.id, name: 'Active', type: 'checkbox', position: 4, config: {}, aggregation: 'sum' } }),
  ])

  const subs = [
    { service: 'Netflix', cost: 1500, renewalDays: 12, active: true },
    { service: 'Spotify Family', cost: 1200, renewalDays: 5, active: true },
    { service: 'Anthropic API', cost: 5500, renewalDays: 20, active: true },
    { service: 'Cloud storage', cost: 800, renewalDays: 8, active: true },
    { service: 'Old gym (cancelled)', cost: 2500, renewalDays: 90, active: false },
  ]

  for (const s of subs) {
    const row = await prisma.tableRow.create({ data: { id: uuidv7(), table_id: tableSubs.id } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: subCols[0].id, value: { text: s.service } } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: subCols[1].id, value: { number: s.cost } } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: subCols[2].id, value: { date: daysFromToday(s.renewalDays).toISOString().split('T')[0] } } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: subCols[3].id, value: { checked: s.active } } })
  }

  // Q2 deliverables
  const tableQ2 = await prisma.table.create({
    data: { id: uuidv7(), user_id: user.id, name: 'Q2 deliverables', folder_id: tablesWork.id, project_id: projQ2.id, created_at: daysAgo(20) },
  })

  const q2Cols = await Promise.all([
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableQ2.id, name: 'Item', type: 'text', position: 1, config: {} } }),
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableQ2.id, name: 'Owner', type: 'text', position: 2, config: {} } }),
    prisma.tableColumn.create({ data: { id: uuidv7(), table_id: tableQ2.id, name: 'Due', type: 'date', position: 3, config: {} } }),
    prisma.tableColumn.create({
      data: {
        id: uuidv7(),
        table_id: tableQ2.id,
        name: 'Status',
        type: 'single_select',
        position: 4,
        config: {
          options: [
            { id: 'opt_001', label: 'Not started', color: 'gray' },
            { id: 'opt_002', label: 'In progress', color: 'blue' },
            { id: 'opt_003', label: 'Blocked', color: 'red' },
            { id: 'opt_004', label: 'Done', color: 'green' },
          ],
        },
      },
    }),
  ])

  const q2Items = [
    { item: 'OKRs document finalized', owner: 'Umar', dueDays: -2, status: 'opt_004' },
    { item: 'Hiring plan signed off', owner: 'HR', dueDays: 5, status: 'opt_002' },
    { item: 'Atlas MVP scope', owner: 'Product', dueDays: 10, status: 'opt_002' },
    { item: 'Budget approval', owner: 'Finance', dueDays: 3, status: 'opt_003' },
    { item: 'Devsinc partnership signed', owner: 'BizDev', dueDays: 30, status: 'opt_002' },
    { item: 'Q2 town hall', owner: 'Comms', dueDays: 14, status: 'opt_001' },
  ]

  for (const i of q2Items) {
    const row = await prisma.tableRow.create({ data: { id: uuidv7(), table_id: tableQ2.id } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: q2Cols[0].id, value: { text: i.item } } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: q2Cols[1].id, value: { text: i.owner } } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: q2Cols[2].id, value: { date: daysFromToday(i.dueDays).toISOString().split('T')[0] } } })
    await prisma.tableCell.create({ data: { id: uuidv7(), row_id: row.id, column_id: q2Cols[3].id, value: { option_id: i.status } } })
  }

  console.log('✓ Created 4 tables with columns and rows')

  // ── Audit log ─────────────────────────────────────────────────────────────
  console.log('Creating audit log entries...')

  const auditEntries = [
    { action: 'task_created', daysAgo: 30 },
    { action: 'note_created', daysAgo: 28 },
    { action: 'project_created', daysAgo: 25 },
    { action: 'task_completed', daysAgo: 20 },
    { action: 'note_updated', daysAgo: 15 },
    { action: 'task_completed', daysAgo: 12 },
    { action: 'capture_processed_to_task', daysAgo: 10 },
    { action: 'task_completed', daysAgo: 8 },
    { action: 'note_updated', daysAgo: 7 },
    { action: 'capture_processed_to_note', daysAgo: 6 },
    { action: 'task_completed', daysAgo: 5 },
    { action: 'task_flagged', daysAgo: 4 },
    { action: 'note_created', daysAgo: 4 },
    { action: 'task_completed', daysAgo: 3 },
    { action: 'capture_processed_to_two_minute_done', daysAgo: 3 },
    { action: 'task_completed', daysAgo: 2 },
    { action: 'note_updated', daysAgo: 2 },
    { action: 'task_completed', daysAgo: 1 },
    { action: 'capture_created', daysAgo: 1 },
    { action: 'task_created', daysAgo: 1 },
  ]

  for (const a of auditEntries) {
    await prisma.auditLog.create({
      data: {
        id: uuidv7(),
        user_id: user.id,
        entity_type: 'task',
        entity_id: user.id,
        action: a.action,
        meta: { seeded: true },
        created_at: daysAgo(a.daysAgo, 10 + Math.floor(Math.random() * 8)),
      },
    })
  }

  console.log('✓ Created audit log entries')

  // ── Post-seed verification ─────────────────────────────────────────────────
  console.log('\nVerifying seeded counts...')
  const [countRows] = await prisma.$queryRaw<
    {
      projects: bigint
      project_folders: bigint
      contexts: bigint
      tags: bigint
      tasks: bigint
      captures: bigint
      notes_folders: bigint
      notes: bigint
      audit_logs: bigint
    }[]
  >`
    SELECT
      (SELECT COUNT(*) FROM "Project"       WHERE user_id = ${user.id}::uuid) AS projects,
      (SELECT COUNT(*) FROM "ProjectFolder" WHERE user_id = ${user.id}::uuid) AS project_folders,
      (SELECT COUNT(*) FROM "Context"       WHERE user_id = ${user.id}::uuid) AS contexts,
      (SELECT COUNT(*) FROM "Tag"           WHERE user_id = ${user.id}::uuid) AS tags,
      (SELECT COUNT(*) FROM "Task"          WHERE user_id = ${user.id}::uuid) AS tasks,
      (SELECT COUNT(*) FROM "Capture"       WHERE user_id = ${user.id}::uuid) AS captures,
      (SELECT COUNT(*) FROM "NotesFolder"   WHERE user_id = ${user.id}::uuid) AS notes_folders,
      (SELECT COUNT(*) FROM "Note"          WHERE user_id = ${user.id}::uuid) AS notes,
      (SELECT COUNT(*) FROM "AuditLog"      WHERE user_id = ${user.id}::uuid) AS audit_logs
  `
  const c = {
    projects: Number(countRows.projects),
    project_folders: Number(countRows.project_folders),
    contexts: Number(countRows.contexts),
    tags: Number(countRows.tags),
    tasks: Number(countRows.tasks),
    captures: Number(countRows.captures),
    notes_folders: Number(countRows.notes_folders),
    notes: Number(countRows.notes),
    audit_logs: Number(countRows.audit_logs),
  }
  console.log(`  projects:        ${c.projects}  (expected 5)`)
  console.log(`  project_folders: ${c.project_folders}  (expected 2)`)
  console.log(`  contexts:        ${c.contexts}  (expected 10)`)
  console.log(`  tags:            ${c.tags}  (expected 6)`)
  console.log(`  tasks:           ${c.tasks}  (expected 50)`)
  console.log(`  captures:        ${c.captures}  (expected 8)`)
  console.log(`  notes_folders:   ${c.notes_folders}  (expected 9)`)
  console.log(`  notes:           ${c.notes}  (expected 14)`)
  console.log(`  audit_logs:      ${c.audit_logs}  (expected 20)`)

  const checks = [
    c.projects === 5,
    c.project_folders === 2,
    c.contexts === 10,
    c.tags === 6,
    c.tasks === 50,
    c.captures === 8,
    c.notes_folders >= 9,
    c.notes >= 14,
    c.audit_logs > 0,
  ]
  if (checks.every(Boolean)) {
    console.log('✓ All counts verified')
  } else {
    console.warn('⚠ Some counts do not match expectations — review output above')
  }

  console.log('\n🎉 Demo seed complete!')
  console.log(`
Summary:
  • 5 projects (3 work, 2 personal)
  • 10 contexts
  • 6 tags
  • 50 tasks (mixed dates, states, projects)
  • 8 captures in Inbox (proposed state)
  • 14 notes across folder hierarchy
  • 4 tables with columns and rows
  • 4 project briefs designated
  • 20 audit log entries for activity feel

Demo user: ${user.email}
`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
