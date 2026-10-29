const mongoose = require('mongoose');
const { Schema } = mongoose;

const interviewQuestionSchema = new Schema(
  {
    question: { type: String, required: true },
    category: { type: String, enum: ['hr', 'technical', 'behavioral', 'company-specific'], required: true },
    subject: {
      type: String,
      enum: ['OS', 'DBMS', 'Computer Networks', 'OOP', 'Java', 'JavaScript', 'React', 'Node', 'MongoDB', 'SQL', 'C++', 'C', 'Python', 'DSA', 'General'],
      default: 'General',
    },
    company: { type: Schema.Types.ObjectId, ref: 'Company' },
    answer: { type: String, required: true },
    // Core concepts an ideal answer should cover. Used server-side by the AI Mock
    // Interview evaluator; never exposed to students. Falls back to `answer` when empty.
    expectedConcepts: [{ type: String, trim: true }],
    explanation: { type: String, default: '' },
    followUpQuestions: [{ type: String }],
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

interviewQuestionSchema.index({ category: 1, subject: 1 });
interviewQuestionSchema.index({ company: 1 });

module.exports = mongoose.model('InterviewQuestion', interviewQuestionSchema);
