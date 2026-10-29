const mongoose = require('mongoose');
const { Schema } = mongoose;

const exampleSchema = new Schema(
  { input: String, output: String, explanation: String },
  { _id: false }
);

const testCaseSchema = new Schema(
  { input: String, expectedOutput: String, isHidden: { type: Boolean, default: false } },
  { _id: false }
);

/**
 * Admin-managed coding problem bank for the student Playground. Each problem
 * carries per-language starter code and a set of test cases (visible
 * examples + optional hidden cases used to grade a "Submit").
 */
const codingProblemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    topic: { type: Schema.Types.ObjectId, ref: 'Topic' },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Easy' },
    description: { type: String, required: true },
    inputFormat: { type: String, default: '' },
    outputFormat: { type: String, default: '' },
    constraints: { type: String, default: '' },
    examples: [exampleSchema],
    testCases: [testCaseSchema],
    supportedLanguages: {
      type: [String],
      enum: ['JavaScript', 'Python', 'C++', 'Java'],
      default: ['JavaScript', 'Python', 'C++', 'Java'],
    },
    starterCode: {
      JavaScript: { type: String, default: '' },
      Python: { type: String, default: '' },
      'C++': { type: String, default: '' },
      Java: { type: String, default: '' },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

codingProblemSchema.index({ difficulty: 1, isActive: 1 });

module.exports = mongoose.model('CodingProblem', codingProblemSchema);
