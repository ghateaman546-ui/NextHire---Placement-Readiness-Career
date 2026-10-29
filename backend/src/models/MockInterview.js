const mongoose = require('mongoose');
const { Schema } = mongoose;

/** AI-based mock interview (solo practice with LLM-generated feedback). */
const mockInterviewSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company' },
    mode: { type: String, enum: ['text', 'voice'], default: 'text' },
    // 2 = admin-managed, one-question-at-a-time flow with per-answer AI scoring.
    // Sessions created before that flow have no version and are never resumed.
    version: { type: Number, default: 1 },
    questions: [
      {
        questionId: { type: Schema.Types.ObjectId, ref: 'InterviewQuestion' },
        question: { type: String, required: true },
        // Snapshot taken at session start so edits/deletes by an admin mid-interview
        // don't break evaluation. Server-side only — stripped from every API response.
        expectedConcepts: [{ type: String }],
        answerText: { type: String, default: '' },
        answerAudioUrl: { type: String, default: '' },
        timeTakenSeconds: { type: Number },
        score: { type: Number, min: 0, max: 10 },
        feedback: { type: String, default: '' },
        strengths: [{ type: String }],
        missingPoints: [{ type: String }],
        evaluatedAt: { type: Date },
        evalModel: { type: String },
      },
    ],
    averageScore: { type: Number, min: 0, max: 10 },
    aiFeedback: {
      confidenceScore: { type: Number, min: 0, max: 100 },
      communicationScore: { type: Number, min: 0, max: 100 },
      technicalScore: { type: Number, min: 0, max: 100 },
      overallRating: { type: Number, min: 0, max: 100 },
      suggestions: [{ type: String }],
      detailedFeedback: { type: String, default: '' },
      llmModel: { type: String },
      generatedAt: { type: Date },
    },
    status: { type: String, enum: ['in-progress', 'completed'], default: 'in-progress' },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

mockInterviewSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('MockInterview', mockInterviewSchema);
