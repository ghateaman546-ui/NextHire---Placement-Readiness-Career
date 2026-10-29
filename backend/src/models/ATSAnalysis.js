const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * ATSAnalysis — one saved ATS Resume Analyzer report.
 * Isolated from the Resume model: it never modifies builder resumes. The raw resume text is NOT stored,
 * only the analysis output (so users can revisit past reports without keeping their files on the server).
 */
const atsAnalysisSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, enum: ['upload', 'builder'], required: true },
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume' }, // set when source === 'builder'
    fileName: { type: String, default: '' },
    fileType: { type: String, default: '' },

    jobDescription: { type: String, default: '', maxlength: 10000 },
    mode: { type: String, enum: ['general', 'job-match'], default: 'general' },

    score: { type: Number, required: true, min: 0, max: 100 },
    grade: { type: String, default: '' },
    breakdown: { type: [Schema.Types.Mixed], default: [] },
    matchedKeywords: { type: [Schema.Types.Mixed], default: [] },
    missingKeywords: { type: [Schema.Types.Mixed], default: [] },
    skills: { type: Schema.Types.Mixed, default: {} },
    sections: { type: [Schema.Types.Mixed], default: [] },
    formattingIssues: { type: [Schema.Types.Mixed], default: [] },
    suggestions: { type: [Schema.Types.Mixed], default: [] },
    // Everything else the UI needs to re-render the full report (content analysis, contact, stats, notes…)
    report: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

atsAnalysisSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ATSAnalysis', atsAnalysisSchema);
