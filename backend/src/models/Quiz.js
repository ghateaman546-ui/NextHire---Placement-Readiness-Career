const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Quiz Schema — powers BOTH:
 *  1) Aptitude quizzes (category = one of the aptitude categories)
 *  2) Domain-wise technical quiz modules (category = 'Technical', subject =
 *     OS/DBMS/OOP/Java/JavaScript/React/Node/SQL/...)
 * Kept as one model since both are timed MCQ sets with the same shape —
 * `subject` is simply unused/null for aptitude quizzes.
 */
const quizQuestionSchema = new Schema(
  {
    question: { type: String, required: true },
    options: { type: [String], validate: (v) => v.length >= 2, required: true },
    correctOptionIndex: { type: Number, required: true },
    explanation: { type: String, default: '' },
  },
  { _id: true }
);

const quizSchema = new Schema(
  {
    title: { type: String, required: true },
    category: {
      type: String,
      enum: ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Data Interpretation', 'Technical'],
      required: true,
    },
    // Only set when category === 'Technical'
    subject: {
      type: String,
      enum: ['OS', 'DBMS', 'Computer Networks', 'OOP', 'Java', 'JavaScript', 'React', 'Node', 'MongoDB', 'SQL', 'C++', 'C', 'Python', 'DSA', null],
      default: null,
    },
    // Drives the "Easy (5) / Medium (15) / Hard (30) / Mixed" quiz-difficulty
    // system: Easy/Medium/Hard quizzes are made of same-difficulty questions;
    // Mixed quizzes combine questions of varying difficulty in one attempt.
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard', 'Mixed'],
      default: 'Medium',
    },
    questions: { type: [quizQuestionSchema], validate: (v) => v.length > 0 },
    timerSeconds: { type: Number, default: 20 * 60 },
    negativeMarkingEnabled: { type: Boolean, default: false },
    negativeMarksPerWrong: { type: Number, default: 0.25 },
    marksPerCorrect: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

quizSchema.index({ category: 1, subject: 1 });
quizSchema.index({ difficulty: 1 });

module.exports = mongoose.model('Quiz', quizSchema);
