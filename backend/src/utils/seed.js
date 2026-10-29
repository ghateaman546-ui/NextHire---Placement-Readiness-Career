/**
 * seed.js — populates the database with a comprehensive placement-prep
 * content bank: topics, companies, DSA "Tasks", coding problems, an
 * interview question bank, and 50+ MCQ quizzes across Easy/Medium/Hard/Mixed
 * difficulty tiers (Aptitude, Reasoning, Verbal, Data Interpretation, and
 * 10 technical subjects). All content-generation logic lives in the pure
 * seedData.js module (safe to unit-check with plain `node`); this file only
 * talks to MongoDB.
 *
 * IMPORTANT: every section below is fault-isolated. Each collection is
 * validated and inserted independently, wrapped in its own try/catch, so a
 * problem in one collection (e.g. one malformed document, or a duplicate-key
 * clash with pre-existing data) can NEVER prevent the other collections from
 * being seeded. At the end, real counts are read back from the database (not
 * assumed from the in-memory arrays) so the summary is always accurate.
 *
 * Run: npm run seed
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const connectDB = require('../config/db');
const { Topic, Company, Question, Quiz, InterviewQuestion, CodingProblem, User, QuizResult, Feedback, Progress, Notification } = require('../models');
const seedData = require('./seedData');
const { leetcodeLinkFor } = require('./leetcodeLinks');

// '+' and '#' carry real meaning in tech names (C++, C#) and would otherwise
// collapse to nothing — e.g. slugify("C++") and slugify("C") would both
// produce "c" and collide on the unique slug index. Map them to words first.
const slugify = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/\+\+/g, '-plus-plus')
    .replace(/\+/g, '-plus')
    .replace(/#/g, '-sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
const label = (doc) => doc.title || doc.name || doc.question || '(untitled)';

/**
 * Validate each document against the Mongoose schema BEFORE writing, then
 * insert only the valid ones with { ordered: false } so unrelated documents
 * always make it in even if a few have problems. Never throws — always
 * returns whatever it managed to insert, and logs exactly what (if anything)
 * went wrong so it's fixable.
 */
async function seedCollection(Model, name, docs) {
  console.log(`\nSeeding ${name} (${docs.length} candidate documents)...`);
  if (!docs.length) return [];

  const valid = [];
  for (const doc of docs) {
    const err = new Model(doc).validateSync();
    if (err) {
      // err.errors is keyed by field path, e.g. { 'subject': ValidatorError, 'topic': ValidatorError }
      // — print each one explicitly so a typo'd enum value or missing ref is obvious at a glance.
      const fieldDetails = err.errors
        ? Object.entries(err.errors).map(([field, fieldErr]) => `${field} (got: ${JSON.stringify(fieldErr.value)}) — ${fieldErr.message}`).join('; ')
        : err.message;
      console.warn(`  ⚠ Skipped "${label(doc)}": ${fieldDetails}`);
    } else {
      valid.push(doc);
    }
  }
  if (!valid.length) {
    console.warn(`  ⚠ No valid ${name} documents to insert — check the warnings above.`);
    return [];
  }

  try {
    const inserted = await Model.insertMany(valid, { ordered: false });
    console.log(`  ✅ Inserted ${inserted.length}/${docs.length} ${name}.`);
    return inserted;
  } catch (err) {
    // With ordered:false, MongoDB still inserts every document that doesn't
    // conflict — err.insertedDocs holds those, and writeErrors explains the rest
    // (most commonly a duplicate-key clash with data left over from a previous run).
    const insertedDocs = err.insertedDocs || err.writeErrors?.map(() => null).filter(Boolean) || [];
    console.error(`  ❌ ${name}: ${insertedDocs.length}/${docs.length} inserted before an error. ${err.message}`);
    if (err.writeErrors) {
      err.writeErrors.slice(0, 5).forEach((we) => console.error(`     - ${we.errmsg || we.err?.errmsg || we}`));
    }
    return insertedDocs;
  }
}

async function seed() {
  const mongoose = require('mongoose');
  await connectDB();
  console.log(`Connected to database: "${mongoose.connection.name}" on ${mongoose.connection.host}`);

  console.log('Clearing existing seed collections...');
  const clearResults = await Promise.allSettled([
    Topic.deleteMany({}),
    Company.deleteMany({}),
    Question.deleteMany({}),
    Quiz.deleteMany({}),
    InterviewQuestion.deleteMany({}),
    CodingProblem.deleteMany({}),
  ]);
  const clearNames = ['Topic', 'Company', 'Question', 'Quiz', 'InterviewQuestion', 'CodingProblem'];
  clearResults.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`  ❌ Failed to clear ${clearNames[i]}: ${r.reason?.message}`);
  });

  // ---- Topics ----
  const topics = await seedCollection(
    Topic,
    'topics',
    seedData.TOPICS.map((t, i) => ({
      name: t.name,
      slug: slugify(t.name),
      description: t.description,
      icon: t.icon,
      category: t.category,
      difficulty: t.difficulty,
      order: i,
    }))
  );
  const byTopicName = (n) => topics.find((t) => t.name === n)?._id;

  // ---- Companies ----
  const companies = await seedCollection(
    Company,
    'companies',
    seedData.COMPANIES.map((c) => ({
      name: c.name,
      slug: slugify(c.name),
      tags: c.tags || [],
      overview: c.overview || '',
      selectionProcess: c.selectionProcess || [],
      salary: c.salary || {},
      previousYearQuestions: c.previousYearQuestions || [],
      faqs: c.faqs || [],
    }))
  );
  const byCompanyName = (n) => companies.find((c) => c.name === n)?._id;

  // ---- DSA question bank ("Tasks") ----
  // Falls back gracefully if a topic lookup ever fails to resolve (logs which one).
  const dsaDocs = [];
  seedData.DSA_QUESTIONS.forEach((dq) => {
    const topicId = byTopicName(dq.topic);
    if (!topicId) {
      console.warn(`  ⚠ Skipped task "${dq.title}": topic "${dq.topic}" was not found (Topics may have failed above).`);
      return;
    }
    dsaDocs.push({
      title: dq.title,
      difficulty: dq.difficulty,
      topic: topicId,
      companyTags: (dq.companies || []).map(byCompanyName).filter(Boolean),
      leetcodeLink: dq.leetcodeLink || leetcodeLinkFor(dq.title),
    });
  });
  await seedCollection(Question, 'DSA tasks', dsaDocs);

  // ---- Coding problems (Playground) ----
  const codingDocs = [];
  seedData.CODING_PROBLEMS.forEach((cp) => {
    const topicId = byTopicName(cp.topic);
    if (!topicId) {
      console.warn(`  ⚠ Skipped coding problem "${cp.title}": topic "${cp.topic}" was not found.`);
      return;
    }
    codingDocs.push({
      title: cp.title,
      slug: cp.slug,
      topic: topicId,
      difficulty: cp.difficulty,
      description: cp.description,
      inputFormat: cp.inputFormat,
      outputFormat: cp.outputFormat,
      constraints: cp.constraints,
      examples: cp.examples,
      testCases: cp.testCases,
      supportedLanguages: cp.supportedLanguages,
      starterCode: cp.starterCode,
      isActive: true,
    });
  });
  const codingProblems = await seedCollection(CodingProblem, 'coding problems', codingDocs);

  // ---- Interview question bank ----
  await seedCollection(
    InterviewQuestion,
    'interview questions',
    seedData.INTERVIEW_QUESTIONS.map((iq) => ({
      question: iq.question,
      category: iq.category,
      subject: iq.subject || 'General',
      company: iq.companyName ? byCompanyName(iq.companyName) : undefined,
      answer: iq.answer,
      followUpQuestions: iq.followUpQuestions || [],
    }))
  );

  // ---- MCQ quiz bank ----
  const generatedQuizzes = seedData.buildAllQuizzes();
  seedData.printQuizAuditReport(generatedQuizzes); // Easy 5 / Medium 15 / Hard 30 / Mixed 30 confirmation table, printed BEFORE insertion
  const allQuizzes = await seedCollection(Quiz, 'quizzes', generatedQuizzes);

  // ---- Sample students (demo/dev only — skipped if students already exist) ----
  console.log('\nSeeding sample students (skipped if students already exist)...');
  let sampleStudents = [];
  try {
    const existingStudentCount = await User.countDocuments({ role: 'student' });
    if (existingStudentCount === 0) {
      const hash = await bcrypt.hash('Student@123', 10);
      sampleStudents = await seedCollection(User, 'sample students', [
        { name: 'Ananya Sharma', email: 'ananya.sharma@vitcollege.edu', password: hash, role: 'student', college: 'VIT Vellore', branch: 'CSE', year: 3, cgpa: 8.7, profileCompletionPercent: 85, currentStreak: 12, questionsSolved: 3, resumeScore: 72, mockInterviewAvgScore: 68, totalPoints: 420, coursesCompleted: 2, lastActiveDate: new Date() },
        { name: 'Rahul Verma', email: 'rahul.verma@nitk.edu', password: hash, role: 'student', college: 'NIT Karnataka', branch: 'IT', year: 4, cgpa: 9.1, profileCompletionPercent: 92, currentStreak: 5, questionsSolved: 2, resumeScore: 80, mockInterviewAvgScore: 75, totalPoints: 610, coursesCompleted: 3, lastActiveDate: new Date(Date.now() - 2 * 86400000) },
        { name: 'Sneha Patel', email: 'sneha.patel@bitspilani.edu', password: hash, role: 'student', college: 'BITS Pilani', branch: 'ECE', year: 2, cgpa: 8.2, profileCompletionPercent: 60, currentStreak: 0, questionsSolved: 1, resumeScore: 55, mockInterviewAvgScore: 0, totalPoints: 150, coursesCompleted: 1, lastActiveDate: new Date(Date.now() - 10 * 86400000) },
      ]);
      if (sampleStudents.length) console.log(`  → password for all sample students: Student@123`);
    } else {
      console.log('  → students already exist, skipped (real user data preserved)');
    }
  } catch (err) {
    console.error(`  ❌ Sample students step failed (non-critical): ${err.message}`);
  }

  // ---- Sample quiz attempts / feedback / progress for the sample students ----
  if (sampleStudents.length) {
    try {
      console.log('\nSeeding sample quiz attempts, feedback, and progress...');
      const [easyQuiz, mediumQuiz, mixedQuiz] = await Promise.all([
        Quiz.findOne({ difficulty: 'Easy' }),
        Quiz.findOne({ difficulty: 'Medium' }),
        Quiz.findOne({ difficulty: 'Mixed' }),
      ]);
      const seededQuizzes = [easyQuiz, mediumQuiz, mixedQuiz].filter(Boolean);

      if (seededQuizzes.length) {
        await seedCollection(
          QuizResult,
          'sample quiz results',
          sampleStudents.flatMap((student, i) =>
            seededQuizzes.slice(0, i + 1).map((quiz) => {
              const total = quiz.questions.length;
              const correct = Math.max(1, total - (i % total || 1));
              return {
                userId: student._id,
                quizId: quiz._id,
                answers: quiz.questions.map((qq, qi) => ({ questionId: qq._id, selectedOptionIndex: qi < correct ? qq.correctOptionIndex : 0, isCorrect: qi < correct })),
                score: correct * (quiz.marksPerCorrect || 1),
                totalQuestions: total,
                correctCount: correct,
                incorrectCount: total - correct,
                timeTakenSeconds: 180 + i * 45,
              };
            })
          )
        );
      }

      await seedCollection(Feedback, 'sample feedback', [
        { userId: sampleStudents[0]._id, name: sampleStudents[0].name, email: sampleStudents[0].email, category: 'feature-request', rating: 5, message: 'Would love a dark/light theme toggle for the DSA sheet!', status: 'new' },
        { userId: sampleStudents[1]._id, name: sampleStudents[1].name, email: sampleStudents[1].email, category: 'bug', rating: 3, message: 'The timer on technical quizzes resets if I switch tabs.', status: 'reviewed' },
        { userId: sampleStudents[2]._id, name: sampleStudents[2].name, email: sampleStudents[2].email, category: 'general', rating: 4, message: 'Really enjoying the platform so far — the new difficulty-tiered quizzes are great practice!', status: 'resolved' },
      ]);

      await seedCollection(
        Progress,
        'sample progress records',
        sampleStudents.flatMap((student) =>
          Array.from({ length: 5 }, (_, d) => {
            const date = new Date();
            date.setDate(date.getDate() - d);
            date.setHours(0, 0, 0, 0);
            return { userId: student._id, date, studyHours: Math.round(Math.random() * 3 * 10) / 10, questionsSolved: Math.floor(Math.random() * 3), quizzesTaken: Math.floor(Math.random() * 2), pointsEarned: Math.floor(Math.random() * 50) };
          })
        )
      );

      await Notification.create({
        type: 'general',
        title: 'Welcome to NextHire 🎉',
        message: 'New topics, companies, tasks and 50+ Easy/Medium/Hard/Mixed quizzes have been added — check them out!',
        createdBy: sampleStudents[0]._id,
      });
    } catch (err) {
      console.error(`  ❌ Sample activity data step failed (non-critical): ${err.message}`);
    }
  }

  // ---- Final summary, read straight back from the database (not assumed) ----
  const [topicCount, companyCount, taskCount, codingCount, interviewCount, quizCount] = await Promise.all([
    Topic.countDocuments(),
    Company.countDocuments(),
    Question.countDocuments(),
    CodingProblem.countDocuments(),
    InterviewQuestion.countDocuments(),
    Quiz.countDocuments(),
  ]);
  console.log('\n================ SEED SUMMARY (live counts from the database) ================');
  console.log(`  Topics:             ${topicCount}`);
  console.log(`  Companies:          ${companyCount}`);
  console.log(`  DSA Tasks:          ${taskCount}`);
  console.log(`  Coding Problems:    ${codingCount}`);
  console.log(`  Interview Qs:       ${interviewCount}`);
  console.log(`  Quizzes:            ${quizCount}`);
  console.log('=================================================================================');
  if (!companyCount || !taskCount || !codingCount) {
    console.warn('\n⚠ One or more collections above is still 0 — scroll up for the specific ⚠/❌ warnings that explain why, and re-run once fixed.');
  } else {
    console.log('\n✅ All collections populated successfully.');
  }
  process.exit(0);
}

seed().catch((err) => {
  console.error('\n❌ Seed crashed unexpectedly:', err);
  process.exit(1);
});
