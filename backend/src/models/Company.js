const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Company Schema — also the backbone of the "company-specific past
 * interview questions bank": previousYearQuestions + interviewExperiences
 * are what the CompanyDetail page and question-bank filters read from.
 */
const companySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    logoUrl: { type: String, default: '' },

    overview: { type: String, default: '' },
    selectionProcess: [{ stage: String, description: String }],
    salary: { role: String, ctcRange: String, notes: String },
    interviewExperiences: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        title: String,
        content: String,
        rounds: Number,
        result: { type: String, enum: ['selected', 'rejected', 'in-progress'] },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    faqs: [{ question: String, answer: String }],
    resources: [{ title: String, url: String, type: { type: String, enum: ['article', 'video', 'pdf', 'link'] } }],

    // Company-specific past interview question bank
    previousYearQuestions: [
      {
        year: Number,
        question: String,
        category: { type: String, enum: ['coding', 'aptitude', 'hr', 'technical'] },
        answer: { type: String, default: '' },
        askedInRound: { type: String, default: '' }, // e.g. "Technical Round 1"
      },
    ],

    tags: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Company', companySchema);
