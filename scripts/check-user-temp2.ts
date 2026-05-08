import { PrismaClient } from '@prisma/client';
async function main() {
  const db = new PrismaClient();
  const userId = '019dd450-b0c7-7e5e-9b85-e6402c34c457';
  // Check tasks - are any soft-deleted or hidden?
  const tasks = await db.task.findMany({ 
    where: { user_id: userId },
    select: { id: true, title: true, state: true, deleted_at: true, created_at: true },
    take: 10,
    orderBy: { created_at: 'desc' }
  });
  const deletedTasks = await db.task.count({ where: { user_id: userId, deleted_at: { not: null } } });
  const activeTasks = await db.task.count({ where: { user_id: userId, deleted_at: null } });
  console.log('Sample tasks:', JSON.stringify(tasks, null, 2));
  console.log('Deleted tasks:', deletedTasks, '| Active tasks:', activeTasks);

  // Check notes
  const deletedNotes = await db.note.count({ where: { user_id: userId, deleted_at: { not: null } } });
  const activeNotes = await db.note.count({ where: { user_id: userId, deleted_at: null } });
  console.log('Deleted notes:', deletedNotes, '| Active notes:', activeNotes);

  // Check projects  
  const deletedProjects = await db.project.count({ where: { user_id: userId, deleted_at: { not: null } } });
  const activeProjects = await db.project.count({ where: { user_id: userId, deleted_at: null } });
  console.log('Deleted projects:', deletedProjects, '| Active projects:', activeProjects);

  await db.$disconnect();
}
main().catch(console.error);
