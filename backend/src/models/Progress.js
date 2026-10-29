const mongoose = require('mongoose');
const { Schema } = mongoose;

const progressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    studyHours: { type: Number, default: 0 },
    questionsSolved: { type: Number, default: 0 },
    quizzesTaken: { type: Number, default: 0 },
    quizAccuracyAvg: { type: Number, default: 0 },
    resumeScoreSnapshot: { type: Number },
    mockInterviewScoreSnapshot: { type: Number },
    skillProgress: [{ skill: String, level: { type: Number, min: 0, max: 100 } }],
    pointsEarned: { type: Number, default: 0 },
  },
  { timestamps: true }
);

progressSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema);
